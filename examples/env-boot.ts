/**
 * Example: Boot from environment variables
 * 
 * This example shows how to use the envBoot() function to start DICloud
 * with configuration loaded from a .env file.
 */

import dotenv from 'dotenv';
import { envBoot } from '../index.js';

// Load environment variables from .env file
dotenv.config();

async function main() {
    console.log('Starting DICloud from environment variables...');

    /**
     * Required .env variables:
     *   TOKEN=your_discord_bot_token
     *   GUILD_ID=your_guild_id
     * 
     * Optional .env variables:
     *   FILES_CHANNEL=files
     *   META_CHANNEL=meta
     *   PORT=3000
     *   ENABLE_HTTPS=false
     *   AUTH=false
     *   USERS=admin:password
     *   ENCRYPT=false
     *   ENCRYPT_PASS=
     *   SAVE_TIMEOUT=2000
     *   SAVE_TO_DISK=false
     */
    
    const app = await envBoot();

    console.log('\n✅ DICloud started from .env configuration!');
    console.log(`WebDAV URL: http://localhost:${process.env.PORT || 3000}/dav`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await app.shutdown();
        process.exit(0);
    });
}

main().catch(console.error);
