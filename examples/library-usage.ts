/**
 * Example: Library-only usage without starting servers
 * 
 * This example shows how to use DICloud as a library to programmatically
 * manage files in Discord storage without starting a WebDAV server.
 */

import { createClient } from '../index.js';

async function main() {
    console.log('Creating DICloud client...');
    
    // Create a client without starting servers
    const client = await createClient({
        token: process.env.TOKEN || 'YOUR_BOT_TOKEN',
        guildId: process.env.GUILD_ID || 'YOUR_GUILD_ID',
        filesChannelName: 'files',  // optional, defaults to 'files'
        metaChannelName: 'meta',    // optional, defaults to 'meta'
        enableEncrypt: false,       // optional, defaults to false
        saveTimeout: 2000,          // optional, defaults to 2000ms
    });

    console.log('Client initialized!');

    // Get the filesystem
    const fs = client.getFs();
    
    // Upload a file
    console.log('Uploading file...');
    const fileData = Buffer.from('Hello from DICloud library!', 'utf-8');
    const file = await client.uploadFile(fileData, 'example.txt');
    console.log('File uploaded:', file);

    // Create a directory in the virtual filesystem
    fs.mkdirSync('/my-folder');
    console.log('Created directory: /my-folder');

    // Upload another file and add to directory
    const file2 = await client.uploadFile(
        Buffer.from('File in folder'),
        'folder-file.txt'
    );
    
    // Add file metadata to directory using filesystem
    fs.setFile('/my-folder/folder-file.txt', file2);
    console.log('Added file to /my-folder/folder-file.txt');

    // List files in root
    console.log('\nFiles in root:');
    const rootFiles = fs.getFilesAndFolders('/');
    rootFiles.forEach(entry => {
        console.log(`  ${entry.file ? '📄' : '📁'} ${entry.name}`);
    });

    // Download a file
    console.log('\nDownloading file...');
    const downloadedData = await client.downloadFile(file);
    console.log('Downloaded:', downloadedData.toString('utf-8'));

    // Create a read stream for large files
    console.log('\nCreating read stream...');
    const readStream = await client.createReadStream(file);
    readStream.on('data', (chunk) => {
        console.log('Received chunk:', chunk.length, 'bytes');
    });
    readStream.on('end', () => {
        console.log('Stream ended');
    });

    // Wait for stream to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Upload using write stream (for large files)
    console.log('\nUploading with write stream...');
    const streamFile = await client.uploadFile(Buffer.alloc(0), 'streamed.txt');
    const writeStream = await client.createWriteStream(streamFile);
    writeStream.write('Chunk 1\n');
    writeStream.write('Chunk 2\n');
    writeStream.end('Chunk 3');
    await new Promise((resolve) => writeStream.on('finish', resolve));
    console.log('✅ File uploaded via stream');

    // Get filesystem statistics
    console.log('\nFilesystem stats:');
    const totalSize = fs.getTreeSizeRecursive('/');
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total files: ${Object.keys(fs.toJSON()).length}`);

    // Gracefully shutdown
    console.log('\nShutting down...');
    await client.shutdown();
    console.log('Done!');
}

// Run the example
main().catch(console.error);
