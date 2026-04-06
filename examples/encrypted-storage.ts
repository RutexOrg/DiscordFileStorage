/**
 * Example: Using encrypted storage
 * 
 * This example demonstrates how to use DICloud with AES-256-GCM encryption
 * for secure file storage in Discord.
 */

import { createClient } from '../index.js';

async function main() {
    console.log('Creating encrypted DICloud client...');

    // Create a client with encryption enabled
    const client = await createClient({
        token: process.env.TOKEN || 'YOUR_BOT_TOKEN',
        guildId: process.env.GUILD_ID || 'YOUR_GUILD_ID',
        filesChannelName: 'encrypted-files',
        metaChannelName: 'encrypted-meta',
        
        // Enable AES-256-GCM encryption
        enableEncrypt: true,
        encryptPassword: 'my-secret-password-32-chars!!',  // 1-32 characters
    });

    console.log('✅ Client initialized with encryption enabled');

    // Upload encrypted file
    const secretData = Buffer.from('This is sensitive data!', 'utf-8');
    const file = await client.uploadFile(secretData, 'secret.txt');
    console.log('✅ Encrypted file uploaded:', file.name);

    // The file is encrypted in Discord storage, but you can access it normally
    const decryptedData = await client.downloadFile(file);
    console.log('✅ Decrypted data:', decryptedData.toString('utf-8'));

    console.log('\nNote: Files are encrypted with AES-256-GCM before upload');
    console.log('      and automatically decrypted on download.');

    // Shutdown
    await client.shutdown();
    console.log('Done!');
}

main().catch(console.error);
