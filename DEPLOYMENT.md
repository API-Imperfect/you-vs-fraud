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
sudo apt-get install -y nodejs build-essential
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

## 3. Put the app on the VM

From your machine (repo root):

```bash
rsync -a --exclude node_modules --exclude dist --exclude fraud-game.sqlite \
  ./ azureuser@<VM_IP>:/opt/fraud-game/
```

> `Permission denied (publickey)` here means the VM does not trust the key
> rsync is offering. Either point it at the key you downloaded when creating
> the VM (`rsync -e "ssh -i ~/path/to/key.pem" ...`), or add your Mac's
> public key (`cat ~/.ssh/id_ed25519.pub`) to the VM via Azure portal →
> VM → Help → *Reset password* → *Reset SSH public key*, then rerun as-is.

(Or push the folder to a git repo and `git clone` it on the VM — better once
the team maintains it.)

## 4. Build on the VM

```bash
ssh azureuser@<VM_IP>
cd /opt/fraud-game
npm ci || npm install
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

```bash
# from your machine
rsync -a --exclude node_modules --exclude dist --exclude fraud-game.sqlite \
  ./ azureuser@<VM_IP>:/opt/fraud-game/

# on the VM
cd /opt/fraud-game && npm ci && npm run build && sudo systemctl restart fraud-game
```

Scores survive restarts and updates: they live in `fraud-game.sqlite`, which
both rsync commands deliberately exclude.

## 9. Operations notes

- **Backup / reset scores:** the database is one file.
  Backup: `cp fraud-game.sqlite backup-$(date +%F).sqlite`.
  Fresh leaderboard for a new event: stop the service, move the file away, start.
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
