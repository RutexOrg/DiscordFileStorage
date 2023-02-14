# DiscordFileStorage:
File manager that allows you to upload and download files to and from Discord and manage them in a windows explorer. 

Yes, even ***above 8MB***.

# State:
Not even alpha. Created for a fun from crazy idea. Don't use it. 
`` Or use, but expect lot,`` **very lot**`` of bugs.``

Has been tested __ONLY on Windows 10__.

# How to setup and play with this:

## Server Creation:
Create a Guild (server) for the bot to use. Save its id.


## Bot Creation:
1. [Create](https://discord.com/developers/applications) a app.
3. Once you created app, you should be in the app menu. Go to ``BOT`` tab and create a bot.
2. Once you created bot and you on bot page, click to ```Show Token```. Save your bot token.
4. Once you saved your token, scroll to the bottom to ``Privileged Gateway Intents``. 
5. Enable ``MESSAGE CONTENT INTENT``. 
6. Goto ``OAuth2/Url-Generator`` tab and select ``bot`` scope.
7. Scroll down to ``Bot Permissions`` and select ``Administrator``.
8. In the bottom you will find url. Copy the link and visit it. Follow the instructions to invite the bot to your server.


## Setup:
1. Install NodeJS, Yarn, Typescript.
2. Clone this repo.
3. Navigate to the root of the project and run ``yarn install``.
4. Create a file named ``.env`` in the root of the project. There example of the file named as ``env.example``. You should fill the file with your data.
5. Run ``yarn start`` to start the bot. This will compile the project and start the bot.

Once server started, the webdav server will be available on port 1900. \
Windows explorer will support webdav out of the box. Not perfect, but for some functionality it will be enough. \
You can now add network drive to your explorer and use discord as a file storage.

Supported functions: 
- Upload files (not folders). 
- Download files (not folders).
- Delete files (not folders).

You ```cant modify or rewrite existing``` files. because of limitations of function principle