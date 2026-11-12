# JTL Super App

A self-contained JMeter performance test reporter for Windows.
Runs as a web app accessible from your LAN or VPN.

## ✅ Requirements

- **Node.js v18 or later** — https://nodejs.org
- That's it. **PostgreSQL is bundled** — no installation needed.

## Quick Start

### First Time Only
1. Install [Node.js v20 LTS](https://nodejs.org)
2. Double-click **`SETUP.bat`**
   - Asks for your admin password and port
   - Installs everything automatically
3. Double-click **`START.bat`**
4. Open `http://localhost:3001` in your browser

### Every Time After That
Just double-click **`START.bat`**.

---

## Accessing from Other Machines (LAN / VPN)

Once the app is running, anyone on your network or connected via VPN opens:
```
http://<your-windows-machine-ip>:3001
```
To find your IP: open Command Prompt and run `ipconfig`

---

## Roles

| Role    | What they can do |
|---------|-----------------|
| **Admin**   | Full access — create/edit/delete everything, manage users |
| **Manager** | Create projects & scenarios, upload JTL files, cannot manage users |
| **Viewer**  | Read-only — view all projects, runs, charts |

Roles are granted/revoked only by Admin, from the **Users** page in the sidebar.

---

## Default Login

| Field    | Value        |
|----------|-------------|
| Username | `admin`     |
| Password | set in SETUP.bat (default: `Admin@1234`) |

**Change your password after first login.**

---

## Running as a Background Service (optional)

Install PM2 to keep the app running even when no one is logged in:

```cmd
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## Data Storage

All data (database files) are stored in the `pgdata/` folder inside the app directory.
To back up your data, just copy that folder.

---

## Supported File Formats

- JMeter `.jtl` files (CSV format)
- `.csv` files with standard JMeter columns:
  `timeStamp, elapsed, label, responseCode, success, bytes, sentBytes, grpThreads, allThreads, Latency, Connect, Hostname`
