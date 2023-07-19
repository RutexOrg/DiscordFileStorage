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

Yes, even ***above 25MB***. Currently tested limit for a single file is about 750MB (+/- 50MB) and 7 GB in multifile mode.

Supported functions: 
- Manage files (Upload, Download, Delete, Rename, Move, Modify)
- Manage folders (Create, Delete, Rename, Move)

# State and details
Not even alpha. **Created for fun and ONLY for fun**. Dont use it in production, since it *active development* and *contains bugs, LOT of _bugs_*.  Use it only for testing and playing around.

Please look at the [Known issues](#known-issues) section for more information.


Has been tested __MAINLY__ on Windows 10 and on some third party webdav clients, like OwlFiles, WinSCP, dolphin. 


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
1. Install [NodeJS (Tested on 16)](https://nodejs.org/en/), [Yarn (Tested on 1.22.10)](https://yarnpkg.com/).
2. Clone this repo.
3. Navigate to the root of the project and run ``yarn install``.
4. Create a file named ``.env`` in the root of the project. There example file ``env.example``, so you can just copy it and rename to ```.env```. You should fill the file with your data (token, server id). Other settings are optional and documented in the file. \
__If you dont have opportunity to use .env file, you can set environment variables instead, they should have the same names as in `.env.example` file.__

5. To run the bot, run ``yarn start``. This will compile the project and start the bot.

## SSL
Warning! At the moment SSL support **is not complete**. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some temponary problems with requests. \
If you want to use SSL, you have to generate a certificate. You can use [this](https://www.sslforfree.com/) service or [this](https://letsencrypt.org/) one. You can also use your own certificate. 


1. Generate a certificate.
2. Rename your certificate to ``cert.pem`` and your private key to ``privKey.pem`` and if you have chain certificate, rename it to ``chain.pem``.
3. Put your certificate and private key to ``certs`` folder. (You have to create manually, its included in ``.gitignore``).
4. Enable HTTPS in ``.env`` file. Set ``ENABLE_HTTPS`` to ``true``.

## Encryption
Files in discord are not encrypted. Because of this, the server supports encryption via __chacha20__ algorithm. 
To enable encryption:
1. Set ``ENCRYPT`` to ``true`` in ``.env`` file.
2. set ``ENCRYPT_PASS`` to your password. This password will be used to encrypt and decrypt files. \
**WARNING**. If you lose this password, you **WILL NOT** be able to decrypt your files.



**Warning**. Unless its look to work stable, encryption feature still being tested. If you see any error like ``decipher Error: Unsupported state or unable to authenticate data``, this is **normal**, the decrypted file **isnt corrupted** (you can check this with any hashing tool yourself).  I will try to fix this in the future.

## Authorization
You can set authorization for the server. To do this, set ``AUTH`` to ``true`` in ``.env`` file.

Then add your username and password to ``.env`` file. Set ``USERS`` to ``username:password``. You can add multiple users, just separate them with ``,``. For example: ``USERS=username1:password1,username2:password2``. At the moment, only basic authorization is supported. 

___
# Last steps
Once server started, the webdav server will be available on port 3000. 

Windows explorer will support webdav out of the box. You can now [add network drive](https://www.maketecheasier.com/map-webdav-drive-windows10/) to localhost:3000 and use DICloud as a regular drive.

You can also open the webdav server in your **explorer directly**. Just go to ``http://localhost:3000/``.

# Known issues

1. Problems with downloading big (~50+ MB) files from **windows** explorer directly. \
This is *limitation* of the windows explorer, which limiting downloading files to *50MB*. This repo contains a registry file, which can be used to increase this limit. Script may be found in: ***scripts/webdav.reg*** \
If you still having issues with this, i recommend to use [WinSCP](https://winscp.net/eng/index.php) for downloading big files. \
**You can also** download big files directly via http. For example, you can use this url: ``http://localhost:3000/file.ext`` or ``http://localhost:3000/my/path/to/file.ext`` to download file ``file.ext`` from root folder or from ``/my/path/to`` folder respectively.

2. Uploading and downloading big files (~1GB+) is working unstable, so if you really need it, split big file into smaller chunks (lets say 100MB, with any archiver like [7zip](https://www.7-zip.org/) or [WinRAR](https://www.rarlab.com/)) and upload them one by one. After downloading, you can merge them back.  \
For now no other solution for this, sorry. 

3. Half-working SSL support. You can use it, but you have to be aware of potential security issues, since TLS_REJECT_UNAUTHORIZED is set to 0 because of some problems which i dont know how to fix for the moment. But if you dont care much about targeted intercetion of your data, you can use it. 

4. Not all webdav clients are working as expected. Will do some work in the future to fix this.