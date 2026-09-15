# Daily data refresh (server-side)

Keeps the live site's `web/data/*.json` current by running `make fetch &&
make build` once a day on the server, then committing and pushing the
result back to GitHub. Caddy bind-mounts `web/` read-only, so the refreshed
files are live the moment the script writes them - no container restart.

Not something you run locally; this is only for the production checkout.

## Install (one-time, on the server)

```sh
# adjust User=/WorkingDirectory in the .service file first if this
# checkout doesn't live at /opt/patrimonioabierto
sudo cp scripts/systemd/patrimonioabierto-daily-refresh.service /etc/systemd/system/
sudo cp scripts/systemd/patrimonioabierto-daily-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now patrimonioabierto-daily-refresh.timer
```

Requires the checkout's git remote to have **push** access (an SSH deploy
key with write permission, or a stored HTTPS credential) - set that up
once as whichever user the service runs as. Without it, `git push` in
`daily_refresh.sh` just fails loudly in the journal; `make fetch`/`make
build` still succeed and the site still gets the refreshed data locally,
it just won't be reflected back in the repo until push access exists.

## Check it

```sh
systemctl list-timers patrimonioabierto-daily-refresh.timer   # next scheduled run
sudo systemctl start patrimonioabierto-daily-refresh.service  # run it right now
journalctl -u patrimonioabierto-daily-refresh.service -f      # watch/inspect a run
```
