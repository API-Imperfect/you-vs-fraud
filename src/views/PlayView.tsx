import { gsap } from "gsap";
import { QRCodeSVG } from "qrcode.react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getConfig, postScore, type Call, type ScoreResult } from "../api";
import {
    ALERT_THRESHOLD,
    INTERDICTION_THRESHOLD,
    RULE_NAMES,
    engineCorrect,
    engineOutcome,
    playerCorrect,
    rwf,
    type Scenario,
    type Verdict,
} from "../engine";
import { SCENARIOS } from "../scenarios";

type Phase = "intro" | "card" | "results";
type Choice = "approve" | "decline";

/** The ethos: an instant payment waits for no one. */
export const DECISION_SECONDS = 10;

const reduced =
	typeof matchMedia !== "undefined" &&
	matchMedia("(prefers-reduced-motion: reduce)").matches;

/** StrictMode-safe entrance: explicit fromTo, transforms cleared on completion. */
function enter(
	targets: gsap.TweenTarget,
	opts: {
		x?: number;
		y?: number;
		scale?: number;
		stagger?: number;
		delay?: number;
		duration?: number;
	} = {},
) {
	if (!targets) return;
	if (reduced) {
		gsap.set(targets, { clearProps: "all" });
		return;
	}
	gsap.killTweensOf(targets);
	gsap.fromTo(
		targets,
		{ opacity: 0, x: opts.x ?? 0, y: opts.y ?? 0, scale: opts.scale ?? 1 },
		{
			opacity: 1,
			x: 0,
			y: 0,
			scale: 1,
			duration: opts.duration ?? 0.45,
			stagger: opts.stagger ?? 0,
			delay: opts.delay ?? 0,
			ease: "power2.out",
			clearProps: "opacity,transform",
		},
	);
}

// ── Paper "thunk" on stamping (synthesized; created on first user gesture) ────
let audioCtx: AudioContext | null = null;
export function initAudio() {
	try {
		audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
		if (audioCtx.state === "suspended") audioCtx.resume();
	} catch {
		/* no audio: the game plays silently */
	}
}
function playThunk() {
	try {
		if (!audioCtx) return;
		const t = audioCtx.currentTime;
		// Low sine thud
		const osc = audioCtx.createOscillator();
		const og = audioCtx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(110, t);
		osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
		og.gain.setValueAtTime(0.4, t);
		og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
		osc.connect(og).connect(audioCtx.destination);
		osc.start(t);
		osc.stop(t + 0.14);
		// Paper slap: short filtered noise burst
		const len = Math.floor(audioCtx.sampleRate * 0.05);
		const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
		const data = buf.getChannelData(0);
		for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / len);
		const noise = audioCtx.createBufferSource();
		noise.buffer = buf;
		const filt = audioCtx.createBiquadFilter();
		filt.type = "lowpass";
		filt.frequency.value = 1200;
		const ng = audioCtx.createGain();
		ng.gain.value = 0.25;
		noise.connect(filt).connect(ng).connect(audioCtx.destination);
		noise.start(t);
	} catch {
		/* ignore */
	}
}

const SLIP_DATE = new Date()
	.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
	.toUpperCase();

const NAME_IDEAS = [
	"Uwase",
	"Mugisha",
	"Keza",
	"Ishimwe",
	"Nshuti",
	"Umutoni",
	"Gasana",
	"Rukundo",
];

export default function PlayView() {
	const [phase, setPhase] = useState<Phase>("intro");
	const [name, setName] = useState("");
	const [i, setI] = useState(0);
	const [calls, setCalls] = useState<Call[]>([]);
	const [picked, setPicked] = useState<Choice | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [rank, setRank] = useState<ScoreResult | null>(null);
	const startedAt = useRef(0);
	const submittedRef = useRef(false);
	const placeholder = useMemo(
		() => NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)],
		[],
	);

	const scenario = SCENARIOS[i];
	const [slipBase, setSlipBase] = useState(
		() => 100000 + Math.floor(Math.random() * 899999),
	);

	function start() {
		setCalls([]);
		setI(0);
		setPicked(null);
		setTimedOut(false);
		setRank(null);
		setSlipBase(100000 + Math.floor(Math.random() * 899999));
		submittedRef.current = false;
		startedAt.current = Date.now();
		initAudio(); // the Start click is our user gesture; stamps can sound now
		setPhase("card");
	}

	function pick(choice: Choice, viaTimeout = false) {
		if (picked) return;
		const correct = playerCorrect(scenario, choice);
		playThunk();
		setPicked(choice);
		setTimedOut(viaTimeout);
		setCalls((prev) => [...prev, { choice, correct }]);
	}

	function next() {
		setPicked(null);
		setTimedOut(false);
		if (i + 1 >= SCENARIOS.length) setPhase("results");
		else setI(i + 1);
	}

	// Submit once (ref guard: StrictMode double-invokes effects in dev)
	useEffect(() => {
		if (phase !== "results" || calls.length !== SCENARIOS.length) return;
		if (submittedRef.current) return;
		submittedRef.current = true;
		postScore({
			name: name.trim() || "Anonymous",
			score: calls.filter((c) => c.correct).length,
			total: SCENARIOS.length,
			durationMs: Date.now() - startedAt.current,
			calls,
		}).then(setRank);
	}, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div
			style={{
				minHeight: "100dvh",
				display: "flex",
				flexDirection: "column",
				padding: "clamp(10px, 2.5vw, 20px)",
				gap: 10,
			}}
		>
			{/* Centered stage: title + card travel together as one block */}
			<main
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						width: "100%",
						maxWidth: 620,
						display: "flex",
						flexDirection: "column",
						gap: 14,
					}}
				>
					<header
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 8,
							textAlign: "center",
						}}
					>
						<h1
							style={{
								fontSize: "clamp(1.3rem, 5vw, 1.9rem)",
								fontWeight: 800,
								letterSpacing: ".02em",
								textTransform: "uppercase",
								margin: 0,
								lineHeight: 1.2,
							}}
						>
							You{" "}
							<span style={{ color: "var(--accent-hot)" }}>
								vs
							</span>{" "}
							Fraud Detection
						</h1>
						{phase === "card" && (
							<div
								className="display tabular"
								style={{
									background: "var(--panel)",
									border: "1px solid var(--line)",
									borderRadius: 999,
									padding: "5px 16px",
									fontSize: ".82rem",
									fontWeight: 700,
									color: "var(--accent)",
								}}
							>
								{i + 1}
								<span
									style={{
										color: "var(--ink-dim)",
										fontWeight: 500,
									}}
								>
									/{SCENARIOS.length}
								</span>
							</div>
						)}
					</header>
					{phase === "intro" && (
						<Intro
							name={name}
							setName={setName}
							placeholder={placeholder}
							onStart={start}
						/>
					)}
					{phase === "card" && (
						<TxCard
							key={i}
							s={scenario}
							slipNo={String(slipBase + i).padStart(6, "0")}
							picked={picked}
							timedOut={timedOut}
							onPick={pick}
							onNext={next}
							isLast={i === SCENARIOS.length - 1}
						/>
					)}
					{phase === "results" && (
						<Results
							calls={calls}
							rank={rank}
							name={name}
							onAgain={() => setPhase("intro")}
						/>
					)}
				</div>
			</main>

			{/* Hand-pressed ink: turbulence-displaced edges for every stamp */}
			<svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
				<filter id="inkpress">
					<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="noise" />
					<feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
				</filter>
			</svg>
		</div>
	);
}

// ── Intro ─────────────────────────────────────────────────────────────────────

function Intro({
	name,
	setName,
	placeholder,
	onStart,
}: {
	name: string;
	setName: (v: string) => void;
	placeholder: string;
	onStart: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [publicUrl, setPublicUrl] = useState("");
	useEffect(() => {
		if (!ref.current) return;
		enter(ref.current.children, { y: 22, stagger: 0.09, duration: 0.5 });
	}, []);
	useEffect(() => {
		// Only fetched for the big-screen QR; phones never show it
		getConfig().then((c) => {
			if (c) setPublicUrl(c.publicUrl);
		});
	}, []);

	return (
		<div
			ref={ref}
			className="gamecard"
			style={{ padding: "clamp(20px, 4vw, 30px)" }}
		>
			<p
				style={{
					...eyebrow,
					fontSize: "clamp(.8rem, 2.8vw, 1rem)",
					textAlign: "center",
					margin: "0 0 12px",
				}}
			>
				<span
					style={{
						fontSize: "1.5em",
						verticalAlign: "-0.15em",
						marginRight: 6,
					}}
				>
					🕵️
				</span>
				A 2-minute game &middot; you are the fraud desk
			</p>
			<h2
				style={{
					fontSize: "clamp(1.25rem, 4.5vw, 1.7rem)",
					fontWeight: 800,
					margin: "0 0 12px",
					lineHeight: 1.3,
				}}
			>
				10 payments.
				<br />
				<span style={{ color: "var(--ok)" }}>Approve</span> or{" "}
				<span style={{ color: "var(--bad)" }}>decline</span>?
			</h2>
			<p style={dimP}>
				An instant payment system puts money in the recipient&rsquo;s
				hands <b style={inkB}>within seconds</b>, and the fraud decision
				has to happen <b style={inkB}>before the money moves</b>. So
				must yours:
			</p>
			<p style={{ ...dimP, fontSize: "1.02rem" }}>
				⏱️{" "}
				<b style={{ color: "var(--accent)" }}>
					{DECISION_SECONDS} seconds per payment.
				</b>{" "}
				<b style={inkB}>No decision? The payment clears.</b>
			</p>
			<p style={dimP}>
				Some of these are fraud. Some are the livelihoods of honest
				people. Block too little and scammers win; block too much and
				you push real customers back to cash.
			</p>
			<label
				style={{
					display: "block",
					fontSize: ".72rem",
					color: "var(--ink-dim)",
					letterSpacing: ".1em",
					textTransform: "uppercase",
					margin: "14px 0 5px",
					fontWeight: 700,
				}}
			>
				Your name (for the wall)
			</label>
			<input
				id="player-name"
				value={name}
				maxLength={24}
				placeholder={`e.g. ${placeholder}`}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
					setName(e.target.value)
				}
				style={{
					width: "100%",
					borderRadius: 12,
					padding: "12px 14px",
					fontSize: "1.05rem",
					background: "#fffdf6",
					border: "1px solid var(--line)",
					color: "var(--ink)",
					marginBottom: 16,
					fontFamily: "var(--body)",
				}}
			/>
			<button
				onClick={onStart}
				style={{ ...btnPrimary, display: "block", margin: "0 auto" }}
				data-testid="start-button"
			>
				Take the desk →
			</button>

			{publicUrl && (
				<div
					className="widescreen-only"
					style={{
						alignItems: "center",
						gap: 14,
						marginTop: 18,
						paddingTop: 16,
						borderTop: "1px dashed var(--line)",
					}}
				>
					<div
						style={{
							background: "#fff",
							borderRadius: 10,
							padding: 8,
							flex: "none",
						}}
					>
						<QRCodeSVG value={publicUrl} size={92} level="M" />
					</div>
					<div
						style={{ fontSize: ".85rem", color: "var(--ink-dim)" }}
					>
						<b style={{ color: "var(--ink)" }}>
							Rather play on your phone?
						</b>
						<br />
						Scan to open the game there, then watch the wall for
						your rank.
					</div>
				</div>
			)}
		</div>
	);
}

// ── Countdown ring ────────────────────────────────────────────────────────────

function TimerRing({
	running,
	onTimeout,
}: {
	running: boolean;
	onTimeout: () => void;
}) {
	const [left, setLeft] = useState(DECISION_SECONDS);
	const wrapRef = useRef<HTMLDivElement>(null);
	const firedRef = useRef(false);

	useEffect(() => {
		if (!running) return;
		firedRef.current = false;
		setLeft(DECISION_SECONDS);
		const t0 = Date.now();
		const t = setInterval(() => {
			const remaining = Math.max(
				0,
				DECISION_SECONDS - (Date.now() - t0) / 1000,
			);
			setLeft(remaining);
			if (remaining <= 0 && !firedRef.current) {
				firedRef.current = true;
				clearInterval(t);
				onTimeout();
			}
		}, 100);
		return () => clearInterval(t);
	}, [running]); // eslint-disable-line react-hooks/exhaustive-deps

	// Pulse when the clock gets scary
	useEffect(() => {
		if (reduced || !wrapRef.current) return;
		if (left <= 3 && left > 0 && running) {
			gsap.fromTo(
				wrapRef.current,
				{ scale: 1.12 },
				{ scale: 1, duration: 0.3, ease: "power2.out" },
			);
		}
	}, [Math.ceil(left)]); // eslint-disable-line react-hooks/exhaustive-deps

	const R = 26,
		C = 2 * Math.PI * R;
	const frac = left / DECISION_SECONDS;
	const color =
		left <= 3
			? "var(--accent-hot)"
			: left <= 6
				? "var(--accent)"
				: "var(--ok)";

	return (
		<div
			ref={wrapRef}
			style={{
				position: "relative",
				width: 64,
				height: 64,
				flex: "none",
			}}
			aria-label={`${Math.ceil(left)} seconds left`}
		>
			<svg width="64" height="64" viewBox="0 0 64 64">
				<circle
					cx="32"
					cy="32"
					r={R}
					fill="none"
					stroke="rgba(34,31,26,.12)"
					strokeWidth="5"
				/>
				<circle
					cx="32"
					cy="32"
					r={R}
					fill="none"
					stroke={color}
					strokeWidth="5"
					strokeLinecap="round"
					strokeDasharray={C}
					strokeDashoffset={C * (1 - frac)}
					transform="rotate(-90 32 32)"
					style={{ transition: "stroke .3s" }}
				/>
			</svg>
			<div
				className="display tabular"
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontWeight: 800,
					fontSize: "1.3rem",
					color,
				}}
			>
				{Math.ceil(left)}
			</div>
		</div>
	);
}

// ── One transaction ───────────────────────────────────────────────────────────

function TxCard({
	s,
	slipNo,
	picked,
	timedOut,
	onPick,
	onNext,
	isLast,
}: {
	s: Scenario;
	slipNo: string;
	picked: Choice | null;
	timedOut: boolean;
	onPick: (c: Choice, viaTimeout?: boolean) => void;
	onNext: () => void;
	isLast: boolean;
}) {
	const cardRef = useRef<HTMLDivElement>(null);
	const stampRef = useRef<HTMLDivElement>(null);
	const fbRef = useRef<HTMLDivElement>(null);
	const correct = picked ? playerCorrect(s, picked) : false;
	// Every stamp lands at its own angle, like a real hand would press it
	const stampRot = useMemo(() => -(4 + Math.random() * 9), [s]);

	useEffect(() => {
		if (!cardRef.current) return;
		enter(cardRef.current, { y: 42, scale: 0.97 });
		enter(cardRef.current.querySelectorAll(".clue"), {
			x: -20,
			stagger: 0.1,
			delay: 0.15,
			duration: 0.35,
		});
	}, [s]);

	useEffect(() => {
		if (!picked) return;
		if (stampRef.current && !reduced) {
			gsap.fromTo(
				stampRef.current,
				{ scale: 2.6, opacity: 0, rotate: stampRot - 12 },
				{
					scale: 1,
					opacity: 1,
					rotate: stampRot,
					duration: 0.3,
					ease: "power4.in",
				},
			);
		}
		if (fbRef.current) {
			enter(fbRef.current, { y: 26, duration: 0.4, delay: 0.2 });
			const score = fbRef.current.querySelector(".engscore");
			const outcome = engineOutcome(s);
			if (score && outcome.score !== null && !reduced) {
				const obj = { v: 0 };
				gsap.to(obj, {
					v: outcome.score,
					duration: 0.8,
					delay: 0.45,
					ease: "power1.out",
					onUpdate: () => {
						score.textContent = String(Math.round(obj.v));
					},
				});
			}
		}
	}, [picked, s]);

	const outcome = engineOutcome(s);
	const verdictLabel: Record<Verdict, string> = {
		allow: "no alert (allow)",
		review: "alert (review)",
		block: "interdiction (block)",
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div
				ref={cardRef}
				className="gamecard"
				style={{
					padding: "clamp(16px, 3.5vw, 24px)",
					position: "relative",
				}}
			>
				{picked && (
					<div
						ref={stampRef}
						className="display"
						style={{
							position: "absolute",
							top: 20,
							right: 14,
							padding: "10px 22px",
							zIndex: 2,
							border: `4px solid ${timedOut ? "var(--accent-hot)" : picked === "approve" ? "var(--ok)" : "var(--bad)"}`,
							color: timedOut
								? "var(--accent-hot)"
								: picked === "approve"
									? "var(--ok)"
									: "var(--bad)",
							borderRadius: 8,
							fontWeight: 800,
							fontSize: "clamp(1.1rem, 4.5vw, 1.5rem)",
							letterSpacing: ".12em",
							textTransform: "uppercase",
							transform: `rotate(${stampRot}deg)`,
							background: "rgba(251,248,239,.9)",
							filter: "url(#inkpress)",
						}}
					>
						{timedOut
							? "⏱ Cleared"
							: picked === "approve"
								? "Approved"
								: "Declined"}
					</div>
				)}

				<div
					className="display"
					style={{
						display: "flex",
						justifyContent: "space-between",
						gap: 10,
						fontSize: ".62rem",
						fontWeight: 500,
						letterSpacing: ".14em",
						color: "var(--ink-dim)",
						borderBottom: "1px dotted var(--line)",
						paddingBottom: 7,
						marginBottom: 10,
					}}
				>
					<span>SLIP N&deg; {slipNo}</span>
					<span>KIGALI &middot; {SLIP_DATE}</span>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 12,
					}}
				>
					<div style={{ flex: 1, minWidth: 0 }}>
						<p
							style={{
								...eyebrow,
								color: "var(--ink-dim)",
								marginBottom: 2,
							}}
						>
							{s.kind}
						</p>
						<p
							className="display tabular"
							style={{
								fontWeight: 800,
								fontSize: "clamp(1.5rem, 6vw, 2.1rem)",
								margin: 0,
								lineHeight: 1.1,
								color: "var(--ink)",
							}}
						>
							{rwf(s.amount)}
						</p>
						<p
							style={{
								color: "var(--ink-dim)",
								fontSize: ".95rem",
								margin: "4px 0 0",
							}}
							dangerouslySetInnerHTML={{ __html: s.route }}
						/>
					</div>
					{!picked && (
						<TimerRing
							running={!picked}
							onTimeout={() => onPick("approve", true)}
						/>
					)}
				</div>

				<ul
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 9,
						margin: "14px 0 0",
						padding: 0,
						listStyle: "none",
					}}
				>
					{s.clues.map((c, idx) => (
						<li
							key={idx}
							className="clue"
							style={{
								display: "flex",
								gap: 12,
								alignItems: "center",
								fontSize: ".95rem",
								color: "var(--ink-dim)",
								background: "rgba(34,31,26,.035)",
								border: "1px solid var(--line)",
								borderRadius: 12,
								padding: "10px 13px",
							}}
						>
							<span
								style={{
									flex: "none",
									fontSize: "1.7rem",
									lineHeight: 1,
								}}
							>
								{c.icon}
							</span>
							<span
								dangerouslySetInnerHTML={{ __html: c.text }}
							/>
						</li>
					))}
				</ul>
			</div>

			{!picked && (
				<div style={{ display: "flex", gap: 12 }}>
					<VerdictButton
						kind="approve"
						onClick={() => onPick("approve")}
					/>
					<VerdictButton
						kind="decline"
						onClick={() => onPick("decline")}
					/>
				</div>
			)}

			{picked && (
				<div
					ref={fbRef}
					className="gamecard"
					style={{
						padding: "14px 16px",
						fontSize: ".92rem",
						borderColor: correct
							? "rgba(29,107,71,.5)"
							: "rgba(179,32,44,.5)",
					}}
				>
					<p
						className="display"
						style={{
							fontWeight: 700,
							fontSize: ".95rem",
							margin: "0 0 4px",
							color: correct ? "var(--ok)" : "var(--bad)",
						}}
					>
						{timedOut
							? "⏱ Too slow. The payment cleared" +
								(s.truth === "fraud"
									? ", and it was fraud."
									: ". Luckily, it was legitimate.")
							: headlineFor(s, picked, correct)}
					</p>
					<p style={{ margin: 0, color: "var(--ink-dim)" }}>
						{s.why}
					</p>

					<div
						style={{
							marginTop: 10,
							paddingTop: 10,
							borderTop: "1px dashed var(--line)",
							fontSize: ".8rem",
							color: "var(--ink-dim)",
						}}
					>
						<span
							style={{ color: "var(--review)", fontWeight: 700 }}
						>
							⚙️ Fraud engine
						</span>{" "}
						{s.efrup ? (
							<>
								Event-Flow Rule Processor: {s.rules[0].reason}{" "}
								&rarr;{" "}
								<b style={{ color: "var(--review)" }}>
									interdiction
								</b>
								, regardless of score.
							</>
						) : (
							<>
								{s.rules.map((r, idx) => (
									<span
										key={r.id}
										className="tabular"
										title={RULE_NAMES[r.id]}
									>
										{idx > 0 && " + "}Rule {r.id} {r.band} (
										{r.wght})
									</span>
								))}
								{" = score "}
								<b
									className="engscore tabular"
									style={{ color: "var(--review)" }}
								>
									{reduced ? outcome.score : 0}
								</b>
								{outcome.verdict === "block" && (
									<>
										{" "}
										{" ≥ "}
										{INTERDICTION_THRESHOLD}
									</>
								)}
								{outcome.verdict === "review" && (
									<>
										{" "}
										{" ≥ "}
										{ALERT_THRESHOLD}
									</>
								)}
								{outcome.verdict === "allow" && (
									<>
										{" "}
										{" < "}
										{ALERT_THRESHOLD}
									</>
								)}
								{" → "}
								<b style={{ color: "var(--review)" }}>
									{verdictLabel[outcome.verdict]}
								</b>
							</>
						)}
					</div>

					<button
						onClick={onNext}
						style={{ ...btnPrimary, width: "100%", marginTop: 12 }}
						data-testid="next-button"
					>
						{isLast
							? "See how the machine did →"
							: "Next payment →"}
					</button>
				</div>
			)}
		</div>
	);
}

function headlineFor(s: Scenario, picked: Choice, correct: boolean): string {
	if (correct && s.truth === "fraud") return "✓ Good call. That was fraud.";
	if (correct) return "✓ Good call. That one was legitimate.";
	if (s.truth === "fraud") return "✕ That was fraud, and you approved it.";
	return "✕ That was legitimate, and you blocked a real customer.";
}

function VerdictButton({
	kind,
	onClick,
}: {
	kind: Choice;
	onClick: () => void;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	const isOk = kind === "approve";
	return (
		<button
			ref={ref}
			onClick={() => {
				if (ref.current && !reduced)
					gsap.fromTo(
						ref.current,
						{ scale: 0.93 },
						{ scale: 1, duration: 0.25, ease: "back.out(3)" },
					);
				onClick();
			}}
			className="display"
			style={{
				flex: 1,
				fontWeight: 800,
				fontSize: "clamp(.95rem, 3.4vw, 1.1rem)",
				letterSpacing: ".03em",
				textTransform: "uppercase",
				borderRadius: 4,
				padding: "18px 10px",
				cursor: "pointer",
				background: "var(--panel-hi)",
				color: isOk ? "var(--ok)" : "var(--bad)",
				border: isOk ? "2px solid var(--ok)" : "2px solid var(--bad)",
				boxShadow: "0 3px 0 var(--line)",
			}}
			data-testid={`${kind}-button`}
		>
			{isOk ? "✓ Approve" : "✕ Decline"}
		</button>
	);
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({
	calls,
	rank,
	name,
	onAgain,
}: {
	calls: Call[];
	rank: ScoreResult | null;
	name: string;
	onAgain: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const youScore = calls.filter((c) => c.correct).length;
	const engScore = SCENARIOS.filter(engineCorrect).length;
	const blockedLegit = SCENARIOS.filter(
		(s, idx) => s.truth === "legit" && calls[idx]?.choice === "decline",
	).length;
	const missedFraud = SCENARIOS.filter(
		(s, idx) => s.truth === "fraud" && calls[idx]?.choice === "approve",
	).length;

	useEffect(() => {
		if (!ref.current) return;
		enter(ref.current.querySelectorAll(".rblock"), { y: 22, stagger: 0.1 });
		if (reduced) return;
		ref.current.querySelectorAll(".countup").forEach((el) => {
			const target = Number(el.getAttribute("data-v") || 0);
			const obj = { v: 0 };
			gsap.to(obj, {
				v: target,
				duration: 1,
				delay: 0.3,
				ease: "power1.out",
				onUpdate: () => {
					el.textContent = String(Math.round(obj.v));
				},
			});
		});
	}, []);

	return (
		<div
			ref={ref}
			className="gamecard"
			style={{ padding: "clamp(20px, 4vw, 28px)" }}
		>
			<p className="rblock" style={eyebrow}>
				🏁 Results &middot; the same 10 payments
			</p>
			<h2
				className="rblock"
				style={{
					fontSize: "clamp(1.25rem, 4.5vw, 1.6rem)",
					fontWeight: 800,
					margin: "0 0 12px",
				}}
			>
				You vs the fraud engine
			</h2>

			<div
				className="rblock"
				style={{ display: "flex", gap: 12, margin: "6px 0 14px" }}
			>
				<ScoreTile
					who={name.trim() || "You"}
					v={youScore}
					color="var(--accent)"
				/>
				<ScoreTile
					who="Fraud engine"
					v={engScore}
					color="var(--review)"
				/>
			</div>

			{rank && (
				<p
					className="rblock"
					style={{ ...dimP, fontWeight: 700, color: "var(--ink)" }}
				>
					🏆 You rank #{rank.rank} of {rank.players}{" "}
					{rank.players === 1 ? "player" : "players"} today. Check the
					wall.
				</p>
			)}

			<table
				className="rblock tabular"
				style={{
					width: "100%",
					borderCollapse: "collapse",
					margin: "4px 0 14px",
					fontSize: ".84rem",
				}}
			>
				<thead>
					<tr>
						{["Tx", "Truth", "Your call", "Engine"].map((h) => (
							<th
								key={h}
								className="display"
								style={{
									padding: 6,
									borderBottom: "1px solid var(--line)",
									fontSize: ".56rem",
									letterSpacing: ".12em",
									textTransform: "uppercase",
									color: "var(--ink-dim)",
									textAlign: h === "Tx" ? "left" : "center",
								}}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{SCENARIOS.map((s, idx) => {
						const you = calls[idx];
						const eo = engineOutcome(s);
						return (
							<tr key={idx}>
								<td
									style={td({
										textAlign: "left",
										color: "var(--ink-dim)",
									})}
								>
									#{idx + 1}
								</td>
								<td style={td()}>
									{s.truth === "fraud" ? (
										<span className="pill p-bad">
											Fraud
										</span>
									) : (
										<span className="pill p-dim">
											Legit
										</span>
									)}
								</td>
								<td style={td()}>
									{you?.choice === "approve" ? (
										<span className="pill p-ok">
											Approve
										</span>
									) : (
										<span className="pill p-bad">
											Decline
										</span>
									)}{" "}
									<b
										style={{
											color: you?.correct
												? "var(--ok)"
												: "var(--bad)",
										}}
									>
										{you?.correct ? "✓" : "✕"}
									</b>
								</td>
								<td style={td()}>
									{eo.verdict === "allow" && (
										<span className="pill p-ok">Allow</span>
									)}
									{eo.verdict === "block" && (
										<span className="pill p-bad">
											Block
										</span>
									)}
									{eo.verdict === "review" && (
										<span className="pill p-rev">
											Review
										</span>
									)}{" "}
									<span
										style={{
											fontSize: ".68rem",
											color: "var(--ink-dim)",
										}}
									>
										{eo.score === null ? "EFRuP" : eo.score}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>

			<div className="rblock">
				{blockedLegit > 0 ? (
					<p style={dimP}>
						You declined{" "}
						<b style={inkB}>
							{blockedLegit} legitimate{" "}
							{blockedLegit === 1 ? "payment" : "payments"}
						</b>
						. Each one is a real person pushed back toward cash.
						Every threshold in a fraud engine is a{" "}
						<b style={inkB}>policy choice</b> balancing safety
						against inclusion. Notice the engine&rsquo;s{" "}
						<span className="pill p-rev">Review</span> on the
						first-time user: a soft hold instead of a hard no.
					</p>
				) : (
					<p style={dimP}>
						You protected every legitimate customer, which is the
						half of the job most people miss. The other half is
						doing it at scale: every threshold in a fraud engine is
						a <b style={inkB}>policy choice</b> balancing safety
						against inclusion. Notice the engine&rsquo;s{" "}
						<span className="pill p-rev">Review</span> on the
						first-time user: a soft hold instead of a hard no.
					</p>
				)}
				{missedFraud > 0 && (
					<p style={dimP}>
						The {missedFraud} fraud{" "}
						{missedFraud === 1 ? "case" : "cases"} you approved
						cleared <b style={inkB}>instantly and irrevocably</b>.
						In a real-time system there is no recall window.
						Detection has to happen <b style={inkB}>before</b> the
						money moves.
					</p>
				)}
			</div>

			<div
				className="rblock"
				style={{
					border: "1px solid rgba(29,107,71,.4)",
					background: "rgba(29,107,71,.06)",
					borderRadius: 14,
					padding: "14px 16px",
					margin: "4px 0 16px",
				}}
			>
				<p
					style={{
						margin: 0,
						fontSize: ".92rem",
						color: "var(--ink-dim)",
					}}
				>
					<b style={inkB}>
						This is why real-time fraud monitoring is part of the
						DPI stack.
					</b>{" "}
					Here in Rwanda, our IIPS (<b style={inkB}>eKash</b>, powered
					by <b style={inkB}>Mojaloop</b>) pairs with{" "}
					<b style={inkB}>Tazama</b>, an open-source, real-time
					transaction monitoring system (a Linux Foundation project)
					that evaluates rules like the ones in this game on every
					payment, in milliseconds. Tazama is scheme-agnostic: it
					works alongside any instant payment system, whatever it is
					built on. The engine in this game runs Tazama&rsquo;s actual
					methodology: banded rule results from its real rule library,
					weighted typology scoring, and the alert ({ALERT_THRESHOLD})
					and interdiction ({INTERDICTION_THRESHOLD}) thresholds from
					Tazama&rsquo;s own sample configuration.{" "}
					<b style={inkB}>
						You are about to see a demo of how it works.
					</b>
				</p>
			</div>

			<button
				className="rblock"
				onClick={onAgain}
				style={btnPrimary}
				data-testid="again-button"
			>
				Play again ↻
			</button>
		</div>
	);
}

function ScoreTile({
	who,
	v,
	color,
}: {
	who: string;
	v: number;
	color: string;
}) {
	return (
		<div
			style={{
				flex: 1,
				background: "rgba(34,31,26,.035)",
				border: "1px solid var(--line)",
				borderRadius: 14,
				padding: 14,
				textAlign: "center",
			}}
		>
			<div
				className="display"
				style={{
					fontSize: ".6rem",
					fontWeight: 700,
					letterSpacing: ".14em",
					textTransform: "uppercase",
					color: "var(--ink-dim)",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{who}
			</div>
			<div
				className="display tabular"
				style={{
					fontWeight: 800,
					fontSize: "clamp(1.7rem, 6vw, 2.2rem)",
					color,
				}}
			>
				<span className="countup" data-v={v}>
					{v}
				</span>
				<span style={{ fontSize: ".6em", color: "var(--ink-dim)" }}>
					/10
				</span>
			</div>
		</div>
	);
}

// ── Shared style helpers ──────────────────────────────────────────────────────

function td(extra: React.CSSProperties = {}): React.CSSProperties {
	return {
		padding: 6,
		borderBottom: "1px solid var(--line)",
		textAlign: "center",
		...extra,
	};
}
const eyebrow: React.CSSProperties = {
	fontFamily: "var(--display)",
	fontWeight: 700,
	fontSize: ".62rem",
	letterSpacing: ".18em",
	textTransform: "uppercase",
	color: "var(--accent)",
	margin: "0 0 8px",
};
const dimP: React.CSSProperties = {
	margin: "0 0 12px",
	color: "var(--ink-dim)",
	maxWidth: "58ch",
};
const inkB: React.CSSProperties = { color: "var(--ink)" };
const btnPrimary: React.CSSProperties = {
	fontFamily: "var(--display)",
	fontWeight: 800,
	fontSize: "1rem",
	letterSpacing: ".04em",
	textTransform: "uppercase",
	background: "var(--accent)",
	color: "#fdfaf2",
	border: "none",
	borderRadius: 4,
	padding: "15px 28px",
	cursor: "pointer",
	boxShadow: "0 3px 0 var(--accent-hot)",
};
