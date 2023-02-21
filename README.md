## Table of Contents
- [DiscordFileStorage](#discordfilestorage)
- [State](#state)
- [How to setup and play with this](#how-to-setup-and-play-with-this)
   - [Discord server creation](#discord-server-creation)
   - [Bot Creation](#bot-creation)
   - [Setup](#setup)
   - [SSL](#ssl)
- [Last steps](#last-steps)
- [Known issues](#known-issues)
---


# DiscordFileStorage
File manager that allows you to upload and download files to and from Discord and manage them in a windows explorer. 

Yes, even ***above 8MB***. Currently tested limit for a single file is about 750MB (+/- 50MB).

Supported functions: 
- Manage files (Upload, Download, Delete, Rename, Move, Modify) \
**but be aware** - each time you modify a file, the whole file being uploaded again. So it good only for small and static files. 
- Manage folders (Create, Delete, Rename, Move)

Empty folders and newly created files without content will be deleted between restarts, since they cached only in memory.  


# State
Not even alpha. **Created for fun**. Dont use it in production, since it *active development* and *contains bugs*.  Use it only for testing and playing around.

Has been tested __ONLY on Windows 10__.

# How to setup and play with this

## Discord server creation
Create a Guild (server) for the bot to use. Save its id. You can also use existing server.

## Bot Creation
Create a bot with admin permissions and invite it to your server. If you already have a bot, you can use it.
1. [Create](https://discord.com/developers/applications) a app.
3. Once you created app, you should be in the app menu. Go to ``BOT`` tab and create a bot.
2. Once you created bot and you on bot page, click to ```Show Token```. Save your bot token.
4. Once you saved your token, scroll to the bottom to ``Privileged Gateway Intents``. 
5. Enable ``MESSAGE CONTENT INTENT``. 
6. Goto ``OAuth2/Url-Generator`` tab and select ``bot`` scope.
7. Scroll down to ``Bot Permissions`` and select ``Administrator``.
8. In the bottom you will find url.  Your url should look like this: ``https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot``.
Copy the link and visit it. Follow the instructions to invite the bot to your server.

## Setup
1. Install [NodeJS](https://nodejs.org/en/), [Yarn](https://yarnpkg.com/), [Typescript](https://www.typescriptlang.org). \
Typescript has been tested with version 4 and yarn with version 1.22.10.
2. Clone this repo.
3. Navigate to the root of the project and run ``yarn install``.
4. Create a file named ``.env`` in the root of the project. There example of the file named as ``env.example``, so you can just copy it and rename to ```.env```. You should fill the file with your data.
5. To run the bot, run ``yarn start``. This will compile the project and start the bot.

## SSL
Warning! At the moment SSL support is not complete. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some temponary problems with requests \
If you want to use SSL, you have to generate a certificate. You can use [this](https://www.sslforfree.com/) service or [this](https://letsencrypt.org/) one. You can also use your own certificate. 


1. Generate a certificate.
2. Rename your certificate to ``cert.pem`` and your private key to ``privKey.pem``) and if you have chain certificate, rename it to ``chain.pem``.
3. Put your certificate and private key to ``certs`` folder. (You have to create manually, its included in ``.gitignore``).
4. Enable HTTPS in ``.env`` file. Set ``ENABLE_HTTPS`` to ``true``.


___
# Last steps
Once server started, the webdav server will be available on port 3000. 

Windows explorer will support webdav out of the box. You can now [add network drive](https://www.maketecheasier.com/map-webdav-drive-windows10/) to localhost:3000 and use discord as a file storage.

# Known issues
1. Problems with stability. Sometimes it may hang or drop the connections on various clients.
2. Problems with downloading big (~200 MB) files from windows explorer directly. I dont know why. For this reason, i recommend to use [WinSCP](https://winscp.net/eng/index.php) for downloading big files but this is not a 100% solution.
3. Sometimes problems with reuploading files. Sometimes it may not work and break inner file structure until restart. Most of such problems are occuring because of third party clients. *This can fixed by restart of the server.* 
4. Half-working SSL support. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some problems which i dont know how to fix for the moment. But if you dont need ssl or you dont care about security, you can use it.
