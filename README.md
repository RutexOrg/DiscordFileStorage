## Table of Contents
- [DICloud](#dicloud)
- [State and details](#state-and-details)
- [How to setup and play with this](#how-to-setup-and-play-with-this)
   - [Discord server creation](#discord-server-creation)
   - [Bot Creation](#bot-creation)
   - [Setup](#setup)
   - [SSL](#ssl)
   - [Encryption](#encryption)
   - [Authorization](#authorization)
- [Last steps](#last-steps)
- [Known issues](#known-issues)
---


# DICloud
File manager that allows you to upload and download files to and from Discord and manage them in a windows explorer. 

Yes, even ***above 8MB***. Currently tested limit for a single file is about 750MB (+/- 50MB) and 1 GB in multifile mode.

Supported functions: 
- Manage files (Upload, Download, Delete, Rename, Move, Modify) \
- Manage folders (Create, Delete, Rename, Move)

Please look at the [Known issues](#known-issues) section for more information.

# State and details
Not even alpha. **Created for fun**. Dont use it in production, since it *active development* and *contains bugs*.  Use it only for testing and playing around.

Has been tested __MAINLY on Windows 10__ and on __dolphin UNIX explorer__.

Please look at the [Known issues](#known-issues) section for more information.

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
1. Install [NodeJS (Tested on 18)](https://nodejs.org/en/), [Yarn (Tested on 1.22.10)](https://yarnpkg.com/).
2. Clone this repo.
3. Navigate to the root of the project and run ``yarn install``.
4. Create a file named ``.env`` in the root of the project. There example of the file named as ``env.example``, so you can just copy it and rename to ```.env```. You should fill the file with your data.
5. To run the bot, run ``yarn start``. This will compile the project and start the bot.

## SSL
Warning! At the moment SSL support **is not complete**. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some temponary problems with requests. \
If you want to use SSL, you have to generate a certificate. You can use [this](https://www.sslforfree.com/) service or [this](https://letsencrypt.org/) one. You can also use your own certificate. 


1. Generate a certificate.
2. Rename your certificate to ``cert.pem`` and your private key to ``privKey.pem``) and if you have chain certificate, rename it to ``chain.pem``.
3. Put your certificate and private key to ``certs`` folder. (You have to create manually, its included in ``.gitignore``).
4. Enable HTTPS in ``.env`` file. Set ``ENABLE_HTTPS`` to ``true``.

## Encryption
Files in discord are not encrypted. Because of this, the server supports encryption via __chacha20__ algorithm. 
To enable encryption:
1. Set ``ENCRYPT`` to ``true`` in ``.env`` file.
2. set ``ENCRYPT_PASS`` to your password. This password will be used to encrypt and decrypt files. **Warning**. If you lose this password, you will not be able to decrypt your files.



**Warning**. Still being tested. If you see any error like ``decipher Error: Unsupported state or unable to authenticate data``, this is **normal**, the decrypted file **isnt corrupted** (you can check this with any hashing tool yourself).  I will try to fix this in the future.

## Authorization
You can set authorization for the server. To do this, set ``AUTH`` to ``true`` in ``.env`` file.

Then add your username and password to ``.env`` file. Set ``USERS`` to ``username:password``. You can add multiple users, just separate them with ``,``. For example: ``USERS=username1:password1,username2:password2``. At the moment, only basic authorization is supported. 


___
# Last steps
Once server started, the webdav server will be available on port 3000. 

Windows explorer will support webdav out of the box. You can now [add network drive](https://www.maketecheasier.com/map-webdav-drive-windows10/) to localhost:3000 and use DICloud as a regular drive.

You can also open the webdav server in your **explorer directly**. Just go to ``http://localhost:3000/``.

# Known issues


1. Renaming of folders with lot of files is very slow, since it requieres to change metadata of each file in the subfolders to display new path correctly after restart.  **WILL BE FIXED.**

2. Boot taking a lot of time with a lot of files. This is because of the fact that the server is caching all files in memory and doing a lot http requests to discord to load files into memory. **WILL BE FIXED.**

3. Empty folders and newly created files without content will be deleted between restarts, since they cached only in memory.  **WILL BE FIXED IN FUTURE**, not a priority for now.


3. Problems with downloading big (~50+ MB) files from **windows** explorer directly. \
This is *limitation* of the windows explorer, which limiting downloading files to *50MB*. This repo contains a registry file, which can be used to increase this limit. Script may be found in: ***scripts/webdav.reg*** \
If you still having issues with this, i recommend to use [WinSCP](https://winscp.net/eng/index.php) for downloading big files. \
**You can also** download big files directly via http. For example, you can use this url: ``http://localhost:3000/file.ext`` or ``http://localhost:3000/my/path/to/file.ext`` to download file ``file.ext`` from root folder or from ``/my/path/to`` folder respectively.


4. Half-working SSL support. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some problems which i dont know how to fix for the moment. But if you dont care much about targeted intercetion of your data, you can use it. 
