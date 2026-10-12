# Echo Media Player

> **Gladys → Echo**: Gladys makes your Echo speak. Not to be confused with Gladys' **Amazon Alexa** integration (with Gladys Plus), which lets you control Gladys by voice from Alexa; both can run side by side.

Make your Echos speak in your scenes, run your Alexa routines, and control music, volume and Do Not
Disturb from Gladys.

> **Unofficial and not affiliated with Amazon.** This integration uses the web API of the Alexa app,
> which Amazon does not document: it may stop working when Amazon changes it.
>
> **Developed without the hardware: feedback welcome.** Tell us on the Gladys forum what works with
> your Echos and what does not.

## Before you start

- Gladys 5.1.0 or later.
- Your Amazon account, with your Echos set up in the Alexa app.
- A **computer** for the sign-in: on a phone with the Alexa app installed, Amazon may open the app
  instead of the sign-in page.

## Sign in to Amazon

You do this once. Gladys never sees your password: you sign in on Amazon's own page.

1. Open **Integrations → Echo Media Player → Configuration**.
2. Choose your **Amazon marketplace** (the site of your account: amazon.fr, amazon.de…) and click
   **Save**.
3. Click **Connect**. Amazon's sign-in page opens in a new tab.
4. Sign in: email, password, and the verification code if two-step verification is on.
5. Amazon then shows a page that looks **empty, broken or "page not found"**. That is expected: the
   address of this page carries the authorization.
6. Click the address bar and copy the **whole address**. It starts with
   `https://www.amazon.fr/ap/maplanding?` (with your marketplace) and is long.
7. Back in Gladys, at the bottom of the Configuration tab, paste it in **Finish the sign-in** and run
   the action, **within a few minutes** (the code expires quickly and works once).
8. The answer says how many Echos were found. The status at the top turns to connected.
9. Open the **Discover** tab and add your Echos.

Gladys now appears as an "Amazon Alexa" device in your Amazon account. To undo everything, run
**Sign out of Amazon**: the credentials are deleted from Gladys and that device is removed from your
account.

### If it fails

- _"This is not the return address"_: you copied the address too early (or the sign-in page itself).
  Finish signing in, then copy the address of the page that follows.
- _"This address belongs to another Amazon marketplace"_: the marketplace of the configuration is
  not the one of the page. Choose the right one, save, click **Connect** again.
- _"Amazon refused the sign-in"_: the code was already used or too old. Click **Connect** and start
  again, a bit faster.
- _"Amazon refused the stored sign-in"_ (later on): the registration was removed from your account,
  or your password changed. Sign in again.

## Your Echos in Gladys

Each Echo is a device. Each multi-room group too.

| Feature                | Echo | Group | Notes                                |
| ---------------------- | ---- | ----- | ------------------------------------ |
| Volume                 | yes  | no    | 0 to 100                             |
| Do not disturb         | yes  | no    | on / off                             |
| Play, pause, prev/next | yes¹ | yes   |                                      |
| Playback state         | yes¹ | yes   | 1 while playing                      |
| Now playing            | yes¹ | yes   | "Title — Artist"                     |
| Notification           | yes  | yes   | for the core's "Play a notification" |

¹ Echos with a music player (not the Echo Spot without music, for instance).

The states are read every 2 minutes by default (**Refresh interval** in the configuration), only for
the Echos you added. Amazon blocks accounts that call it too often: do not go below the default
without a reason.

The **Language of names and messages** setting gives the names of the features of the Echos you add
afterwards (Gladys keeps them once a device is added) and the language of the error messages.

## In scenes

**Make an Echo speak** (Echo Media Player actions):

- **Echos**: one or several; a group speaks through its speakers.
- **Text to say**: scene variables are allowed. Up to 1,000 characters; Alexa says long texts in
  pieces of 250 characters.
- **How**: _Speak_ (the Echo just talks) or _Announcement_ (a chime first, on every chosen Echo at
  once).
- **Volume** (optional): set before speaking, then the previous volume comes back.

**Run an Alexa routine**: type the name of the routine as in the Alexa app, or the phrase that
triggers it. The **List my Alexa routines** button of the configuration shows the names. Choose an
Echo if the routine has steps acting on "the device you speak to".

**Echo: Do Not Disturb**: on or off, on one or several Echos.

**Play a notification** (the core's action, in the Music category) also works with an Echo, but
needs **Gladys Plus**: the core turns your text into an audio file there and sends only its address
(and not the volume). Alexa plays an audio file only in some formats; if your Echo stays silent,
use **Make an Echo speak**, which sends the text itself.

## Dashboard widget

Add the **Echo player** widget and choose an Echo: title, artist, state, Do Not Disturb, the live
volume and previous / play-pause / next buttons.

## Limitations

- Unofficial API: it can break when Amazon changes it.
- No mute (the web API offers none) and no scene trigger (nothing reliable to start a scene on).
- Two speeches sent at the same moment may interrupt each other.
- Tested only against reconstructed answers, never on a real account yet.

## Privacy

The integration stores, in its own folder of Gladys (`/data`, readable by the integration only):
the refresh token of the "Amazon Alexa" registration, the marketplace and your Amazon customer id.
Nothing else, and never in the logs. It talks only to Amazon.
