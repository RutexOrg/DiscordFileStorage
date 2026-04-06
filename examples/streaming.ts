/**
 * Example: Using streams for efficient large file handling
 * 
 * This example demonstrates how to use read and write streams
 * for memory-efficient file operations.
 */

import { createClient } from '../index.js';
import fs from 'fs';
import { pipeline } from 'stream/promises';

async function main() {
    console.log('Creating DICloud client...');
    
    const client = await createClient({
        token: process.env.TOKEN || 'YOUR_BOT_TOKEN',
        guildId: process.env.GUILD_ID || 'YOUR_GUILD_ID',
    });

    console.log('✅ Client initialized!\n');

    // Example 1: Upload using write stream
    console.log('Example 1: Uploading with write stream...');
    
    // First create a placeholder file
    const uploadFile = await client.uploadFile(Buffer.alloc(0), 'streamed-upload.txt');
    
    // Get write stream
    const writeStream = await client.createWriteStream(uploadFile);
    
    // Write data in chunks (simulating streaming)
    writeStream.write('First chunk of data\n');
    writeStream.write('Second chunk of data\n');
    writeStream.write('Third chunk of data\n');
    writeStream.end('Final chunk!');
    
    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
    
    console.log('✅ File uploaded via write stream\n');

    // Example 2: Download using read stream
    console.log('Example 2: Downloading with read stream...');
    
    const readStream = await client.createReadStream(uploadFile);
    
    let downloadedData = '';
    readStream.on('data', (chunk) => {
        downloadedData += chunk.toString();
        console.log(`  Received chunk: ${chunk.length} bytes`);
    });
    
    await new Promise((resolve, reject) => {
        readStream.on('end', resolve);
        readStream.on('error', reject);
    });
    
    console.log('✅ File downloaded via read stream');
    console.log('Downloaded content:\n', downloadedData, '\n');

    // Example 3: Stream from local file to Discord
    console.log('Example 3: Upload from local file (if exists)...');
    
    const localFilePath = './package.json'; // Use existing file for demo
    
    if (fs.existsSync(localFilePath)) {
        const fileStats = fs.statSync(localFilePath);
        console.log(`  Uploading ${localFilePath} (${fileStats.size} bytes)...`);
        
        // Create placeholder
        const localFile = await client.uploadFile(Buffer.alloc(0), 'package-copy.json');
        
        // Create streams
        const writeStream = await client.createWriteStream(localFile);
        const readStream = fs.createReadStream(localFilePath);
        
        // Pipe local file to Discord
        await pipeline(readStream, writeStream);
        
        console.log('✅ Local file uploaded to Discord\n');
    } else {
        console.log('  ⏭️  Skipped (package.json not found)\n');
    }

    // Example 4: Download to local file
    console.log('Example 4: Download to local file...');
    
    const outputPath = './downloaded-file.txt';
    const readStream2 = await client.createReadStream(uploadFile);
    const writeStream2 = fs.createWriteStream(outputPath);
    
    await pipeline(readStream2, writeStream2);
    
    console.log(`✅ File downloaded to ${outputPath}\n`);

    // Example 5: Stream processing (transform during download)
    console.log('Example 5: Transform stream (uppercase)...');
    
    const { Transform } = require('stream');
    const upperCaseTransform = new Transform({
        transform(chunk, encoding, callback) {
            callback(null, chunk.toString().toUpperCase());
        }
    });
    
    const readStream3 = await client.createReadStream(uploadFile);
    
    let transformedData = '';
    readStream3
        .pipe(upperCaseTransform)
        .on('data', (chunk) => {
            transformedData += chunk.toString();
        });
    
    await new Promise((resolve) => {
        upperCaseTransform.on('end', resolve);
    });
    
    console.log('✅ Transformed content:\n', transformedData, '\n');

    // Cleanup
    console.log('Cleaning up...');
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('  Removed downloaded file');
    }

    await client.shutdown();
    console.log('\n✅ Done! Streams are great for:');
    console.log('  - Large files (avoid loading entire file into memory)');
    console.log('  - Real-time processing (transform data on the fly)');
    console.log('  - Piping between sources (file, network, compression, etc.)');
}

main().catch(console.error);
