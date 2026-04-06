/**
 * Example: Full server mode with WebDAV
 * 
 * This example shows the traditional usage - starting both the Discord bot
 * and WebDAV server for file access through standard file managers.
 */

import { boot } from '../index.js';

async function main() {
    console.log('Starting DICloud in full server mode...');

    // Boot with full server initialization
    const app = await boot({
        // Discord configuration
        token: process.env.TOKEN || 'YOUR_BOT_TOKEN',
        guildId: process.env.GUILD_ID || 'YOUR_GUILD_ID',
        filesChannelName: 'files',
        metaChannelName: 'meta',

        // WebDAV server configuration
        webdavPort: 3000,
        startWebdavServer: true,
        enableHttps: false,

        // Authentication (optional)
        enableAuth: false,
        users: 'admin:password123',  // format: user1:pass1,user2:pass2

        // Encryption (optional)
        enableEncrypt: false,
        encryptPassword: '',

        // Storage settings
        saveTimeout: 2000,
        saveToDisk: false,
    });

    console.log('\n✅ DICloud server started!');
    console.log('WebDAV URL: http://localhost:3000/dav');
    console.log('Web Interface: http://localhost:3000/');
    console.log('\nYou can now:');
    console.log('  - Mount the WebDAV drive in your file manager');
    console.log('  - Access files through the web interface');
    console.log('  - Use the API programmatically:');
    console.log('');

    // You can still use the API programmatically
    const fs = app.getFs();
    console.log(`Current files: ${Object.keys(fs.toJSON()).length}`);

    // Keep the server running
    console.log('\nPress Ctrl+C to stop the server');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down gracefully...');
        await app.shutdown(true);  // save to disk on shutdown
        process.exit(0);
    });
}

main().catch(console.error);
