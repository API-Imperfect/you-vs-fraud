# Deploying to an Azure VM

How to run **You vs Fraud Detection** on a single Azure VM, before you have a
domain name (public IP only), and what changes once the domain arrives.

The app is one Node process on one port: Express serves the built frontend and
the three API routes, SQLite is a single file on disk. No container platform,
no managed database, no orchestration needed. A `Standard_B1s` (1 vCPU, 1 GB)
is more than enough for a demo-day audience.

---

## 0. Assumptions

- Ubuntu 22.04/24.04 VM, you can SSH in (`ssh azureuser@<VM_IP>`)
- The code lives on GitHub at <https://github.com/API-Imperfect/you-vs-fraud>
  (public, `main` branch). The VM pulls from there; nothing is copied from
  your laptop.
- The app listens on port **4000**; Caddy in front of it on ports **80/443**
  (Caddy gets and renews HTTPS certificates automatically once a domain exists)
- Replace `<VM_IP>` everywhere with the VM's public IP

## 1. Open the ports (Azure Portal)

Open **80 and 443** now — 443 so HTTPS works the moment the domain lands.

1. In the [Azure Portal](https://portal.azure.com), open your **virtual machine**.
2. Left menu: **Networking → Network settings** (older portals: "Networking").
3. Under **Rules**, click **Create port rule → Inbound port rule** and fill in:
   - **Destination port ranges:** `80,443`
   - **Protocol:** TCP
   - **Action:** Allow
   - **Priority:** `310` (any number lower than deny rules works)
   - **Name:** `allow-http-https`
4. **Add**, and wait a few seconds for the rule to show in the list.

Two more portal checks while you are there:

- **Public IP is Static:** VM → Overview → click the public IP → Configuration
  → Assignment = **Static**. (The default can be Dynamic, which changes the IP
  on every stop/start — that would silently break your QR codes and, later,
  your DNS record.)
- **SSH (port 22):** edit its inbound rule so **Source** is "My IP address"
  rather than Any, if your own IP is stable.

## 2. Install Node.js 20 on the VM

```bash
sudo apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential git
node --version   # v20.x

# Caddy (from Ubuntu's own repo; 24.04 ships 2.6.x, plenty for a reverse proxy)
sudo apt-get install -y caddy
caddy version
```

> Don't add Caddy's third-party apt repo (dl.cloudsmith.io). It has been
> returning `402 Payment Required` and any `apt-get update` then fails for
> every package. If you already added it, remove it first:
> ```bash
> sudo rm -f /etc/apt/sources.list.d/caddy-stable.list \
>            /usr/share/keyrings/caddy-stable-archive-keyring.gpg
> sudo apt-get update
> ```

`build-essential` lets npm compile better-sqlite3's native module. If that
compile ever fails, the app still runs: the store falls back to in-memory
(scores reset on restart), so you can fix it later.

## 3. Clone the app onto the VM

On the VM:

```bash
sudo mkdir -p /opt/fraud-game
sudo chown azureuser:azureuser /opt/fraud-game
git clone https://github.com/API-Imperfect/you-vs-fraud.git /opt/fraud-game
```

The repo is public, so no GitHub credentials are needed on the VM. If it is
ever made private, give the VM read-only access with a deploy key:
`ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""` on the VM, paste the
`.pub` into GitHub → repo → Settings → Deploy keys, and clone the
`git@github.com:API-Imperfect/you-vs-fraud.git` URL instead.

## 4. Build on the VM

```bash
cd /opt/fraud-game
npm ci
npm run build          # produces dist/
```

Smoke test before wiring anything else:

```bash
PUBLIC_URL=http://<VM_IP> PORT=4000 node server/index.js
# in another terminal on the VM:
curl -s localhost:4000/api/health      # {"status":"ok"}
curl -s localhost:4000/api/config      # {"publicUrl":"http://<VM_IP>"}
```

Ctrl+C when satisfied.

## 5. Run it as a service (systemd)

`PUBLIC_URL` is what the QR codes encode. Until the domain exists, set it to
the VM's public IP.

```bash
sudo tee /etc/systemd/system/fraud-game.service > /dev/null << 'EOF'
[Unit]
Description=You vs Fraud Detection (RISA DPI Demo Center)
After=network.target

[Service]
Type=simple
User=azureuser
WorkingDirectory=/opt/fraud-game
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=PUBLIC_URL=http://<VM_IP>
Environment=DB_FILE=/opt/fraud-game/fraud-game.sqlite
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fraud-game
systemctl status fraud-game          # should be active (running)
journalctl -u fraud-game -f          # live logs
```

## 6. Caddy on port 80

So visitors type `http://<VM_IP>` with no port. The whole reverse proxy is
two lines:

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
:80 {
    reverse_proxy 127.0.0.1:4000
}
EOF

sudo systemctl reload caddy
```

**Checkpoint:** from any phone, open `http://<VM_IP>` → the game;
`http://<VM_IP>/wall` → the wall. The wall's QR points at `http://<VM_IP>`
because that is what `PUBLIC_URL` says.

> Skipping Caddy? Open port 4000 in the NSG instead and set
> `PUBLIC_URL=http://<VM_IP>:4000`. Works fine; just uglier URLs on the QR.

## 7. When the domain arrives

1. DNS: create an **A record** (e.g. `games.risa.gov.rw`) → `<VM_IP>`.
2. Caddy: replace `:80` with the domain and reload. **That is also the entire
   HTTPS setup** — Caddy obtains and renews the Let's Encrypt certificate
   automatically and redirects HTTP to HTTPS:
   ```bash
   sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
   games.risa.gov.rw {
       reverse_proxy 127.0.0.1:4000
   }
   EOF
   sudo systemctl reload caddy
   ```
   (Requires port 443 open in the NSG, done in step 1, and the DNS record
   already resolving to the VM.)
3. Update one line in the service and restart:
   ```bash
   sudo systemctl edit fraud-game    # override:
   # [Service]
   # Environment=PUBLIC_URL=https://games.risa.gov.rw
   sudo systemctl restart fraud-game
   ```

That is the whole domain migration: **every QR code updates itself** on the
next page load, because both QRs render whatever `/api/config` returns.

## 8. Updating the app

Commit and push to `main` from your machine, then on the VM:

```bash
cd /opt/fraud-game
git pull --ff-only
npm ci                       # only needed if package-lock.json changed, harmless otherwise
npm run build
sudo systemctl restart fraud-game
```

Scores survive restarts and updates: they live in `fraud-game.sqlite`, which
is in `.gitignore`, so `git pull` never touches it.

To roll back, check out the previous commit and rebuild:
`git log --oneline -5`, then `git checkout <sha>`, `npm run build`,
`sudo systemctl restart fraud-game`. Return to `main` with `git checkout main`.

> `git pull` refuses with "local changes would be overwritten"? Someone
> edited files directly on the VM. Discard them with `git checkout -- .`
> (the database is untracked and is not affected), then pull again.

## 9. Operations notes

- **Reset the leaderboard (between sessions):** set `ADMIN_KEY` in the systemd
  unit (`Environment=ADMIN_KEY=<long random string>`), then from anywhere:
  ```bash
  curl -X POST -H "x-admin-key: <key>" http://<VM_IP or domain>/api/admin/reset
  ```
  Returns `{"cleared": N}` and the wall empties on its next poll (~2.5s).
  Without `ADMIN_KEY` set, the endpoint only answers from the VM itself
  (SSH in, then `curl -X POST localhost:4000/api/admin/reset`).
- **Backup scores first if you want them:** the database is one file:
  `cp fraud-game.sqlite backup-$(date +%F).sqlite`.
- **Logs:** `journalctl -u fraud-game --since today`
- **Health:** `curl localhost:4000/api/health` (wire into Azure monitoring if you like)
- **Reboot-proof:** `systemctl enable` already handles VM restarts.
- **Security posture:** the app stores only player-typed names and scores; no
  accounts, no secrets, no personal data. The API is open by design (it is a
  public game). The only hardening that matters is keeping SSH locked down
  and the VM patched (`sudo apt-get upgrade`).

## 10. Demo-day checklist

- [ ] `systemctl status fraud-game` green
- [ ] `http://<VM_IP or domain>` loads the game on a phone **on mobile data**
      (proves it is really public, not just venue Wi-Fi)
- [ ] `/wall` on the venue screen, QR scans from 3 meters away
- [ ] Play one test round, confirm it appears on the wall, then reset the
      database for a clean leaderboard
