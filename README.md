# 👻 ghosted

**Your to-do list is haunted.** Built for Hackyard Yard #5: Haunted.

Every task is a ghost waiting for its hour. When the hour comes, Ghosted asks: *did you do it?*

- **Yes:** the ghost is set free.
- **No:** it haunts you until midnight.
- **Postpone:** a ghost stays at the time you abandoned. Postpone three times and the task is **possessed**.
- **Midnight:** count your ghosts, then they all vanish.

## It creeps into real things

- **Your Google Calendar** (optional): your day's events become ghosts, and every ghost becomes a real, see-through event at the time you abandoned. Move an event in Google Calendar and a ghost appears within seconds.
- **Your browser tab:** the tab title whispers about the tasks you left behind.
- **Your desktop:** opt-in notifications ask "did you do it?" when a task's hour comes.

There's no login needed to try it. Sound effects are generated in the browser, and **My haunted day** makes a shareable image of your ghosts.

## Run locally

```bash
npm install
npm run dev
```

Optional `.env` for Google Calendar:

```
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
VITE_GHOSTED_CALENDAR_ID=optional-calendar-id   # defaults to your primary calendar
```

Built with React + Vite. No backend: your day is stored in your browser.
