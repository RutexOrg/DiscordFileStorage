# DICloud Examples

This directory contains usage examples for DICloud.

## Examples

### 1. **library-usage.ts** - Library-only mode (no servers)
Shows how to use DICloud as a library to programmatically manage files without starting any servers. Includes basic file operations and streaming.

```bash
# Set environment variables
export TOKEN=your_bot_token
export GUILD_ID=your_guild_id

# Run example (after building)
npm run build
node out/examples/library-usage.js
```

**Use case**: Integrating DICloud into your own application for programmatic file storage.

---

### 2. **streaming.ts** - Efficient large file handling with streams
Comprehensive examples of read/write streams for memory-efficient file operations.

```bash
npm run build
node out/examples/streaming.js
```

**Use case**: Uploading/downloading large files without loading them entirely into memory.

---

### 3. **full-server.ts** - Full server mode with WebDAV
Traditional usage with both Discord bot and WebDAV server running.

```bash
npm run build
node out/examples/full-server.js
```

**Use case**: Running DICloud as a standalone WebDAV server for file manager access.

---

### 4. **env-boot.ts** - Boot from environment variables
Shows how to use `.env` file configuration.

```bash
# Create .env file with:
# TOKEN=your_bot_token
# GUILD_ID=your_guild_id

npm run build
node out/examples/env-boot.js
```

**Use case**: Deploying DICloud with environment-based configuration.

---

### 5. **encrypted-storage.ts** - Encrypted file storage
Demonstrates AES-256-GCM encrypted storage.

```bash
npm run build
node out/examples/encrypted-storage.js
```

**Use case**: Storing sensitive files with encryption in Discord.

---

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

2. **Set up Discord bot**:
   - Create a bot at https://discord.com/developers/applications
   - Get your bot token
   - Get your guild (server) ID
   - Invite bot to your server with Administrator permissions

3. **Set environment variables**:
   ```bash
   export TOKEN=your_discord_bot_token
   export GUILD_ID=your_guild_id
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Run an example**:
   ```bash
   node out/examples/library-usage.js
   ```

## TypeScript Examples

All examples are written in TypeScript. To run them:

1. Build the project: `npm run build`
2. Run compiled JS: `node out/examples/<example-name>.js`

Or use `ts-node` for direct TypeScript execution:

```bash
npx ts-node examples/library-usage.ts
```
