# Level Up HQ: one-time Google sign-in setup

The site is public but holds no data. Every number comes from the Level Up HQ Google Sheet, read live in your browser after you sign in with Google. If a Google account can't open the sheet, it sees nothing.

To make "Sign in with Google" work, you create one free Google Cloud project and an OAuth client ID. About 10 minutes. The client ID is not a secret, so you can just send it over when you're done.

## 1. Make the project

1. Go to https://console.cloud.google.com and sign in as hamannlpcornhole@gmail.com.
2. Click the project picker at the top left (next to "Google Cloud").
3. Click **New Project**.
4. Project name: `Level Up HQ`. Leave Location as is.
5. Click **Create**. Wait a few seconds, then pick **Level Up HQ** in the project picker so it's the active project.

## 2. Turn on the Sheets API

1. In the search bar at the top, type `Google Sheets API` and click it.
2. Click **Enable**.

## 3. Set up the consent screen

1. Left menu: **APIs & Services** > **OAuth consent screen** (it may say **Google Auth Platform** > **Branding**).
2. Click **Get started**.
3. App name: `Level Up HQ`. User support email: hamannlpcornhole@gmail.com. Click **Next**.
4. Audience: pick **External**. Click **Next**.
5. Contact email: hamannlpcornhole@gmail.com. Click **Next**.
6. Check the box to agree to the policy. Click **Continue**, then **Create**.
7. Go to **Audience** in the left menu. Publishing status should say **Testing**. Leave it there.
8. Under **Test users**, click **Add users** and add:
   - hamannlpcornhole@gmail.com
   - RICHARD_EMAIL_HERE (Richard's Google account)
9. Click **Save**.

Testing mode is fine for HQ. Only the test users can sign in, and Google shows a "Google hasn't verified this app" notice the first time. Click **Continue** on it.

## 4. Make the client ID

1. Left menu: **Clients** (or **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID**).
2. Click **Create client**.
3. Application type: **Web application**.
4. Name: `Level Up HQ site`.
5. Under **Authorized JavaScript origins**, click **Add URI** and paste:
   `https://hamannlpcornhole-beep.github.io`
   (No slash at the end, no /level-up-hq.)
6. Leave **Authorized redirect URIs** empty.
7. Click **Create**.
8. A box shows **Client ID**. It ends in `.apps.googleusercontent.com`. Copy it.

You can ignore the client secret. The site doesn't use it.

## 5. Send it over

Send the client ID. It goes into `config.js` as `GOOGLE_CLIENT_ID`, gets pushed, and the sign-in button turns on.

## 6. Give Richard the sheet

Richard also needs view access on the Level Up HQ sheet itself (Share > add his email > Viewer). Being a test user lets him sign in. Sheet access is what lets him see numbers.

## Good to know

- Sign-in asks only for "See your Google Sheets spreadsheets" (read only). HQ never writes to the sheet.
- The sign-in token lives in the open tab only. Close the tab and it's gone.
- Preview without signing in: https://hamannlpcornhole-beep.github.io/level-up-hq/?demo=1 (made-up sample data).
