import fs from "fs";

export function truncate(str: string, n: number, includeDots: boolean = false) {
    return ((str.length > n) ? str.substr(0, n - 1) : str) + (includeDots && str.length > n ? '...' : '');
}

export function printAndExit(message: string, exitCode: number = 1) {
    console.log(message);
    process.exit(exitCode);
}

export function getEnv(name: string, assertString: string, type: "string" | "number" | "boolean" = "string", defaultValue?: any): any {
    const value = process.env[name]!;
    if (!value) {
        if (defaultValue !== undefined) {
            console.log("Env variable " + name + " is not set" + (assertString.length > 0 ? ": " + assertString : "") + ". Using default value: " + (defaultValue === "" ? "N/A" : defaultValue));
            return defaultValue;
        }
        printAndExit("Required env variable " + name + " is not set" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
    };

    const valueLower = value.toLowerCase();

    if (type == "boolean") {
        if (valueLower === "true") {
            return true;
        } else if (valueLower === "false") {
            return false;
        } else {
            printAndExit("Env variable " + name + " is not set to true or false" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
        }
    }

    if (type == "number") {
        const number = parseInt(value!);
        if (isNaN(number)) {
            printAndExit("Env variable " + name + " is not set to number" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
        }
        return number;
    }

    if (type == "string" && value.length == 0) {
        printAndExit("Env variable " + name + " is empty" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
    }

    return value;
}

export function readFileSyncOrUndefined(path: string): Buffer | undefined {
    try {
        return fs.readFileSync(path);
    } catch (error) {
        console.warn("File " + path + " is not found. Skipping.");
        return undefined;
    }
}

export function checkIfFileExists(path: string, soft: boolean, assertString: string = ""): boolean {
    try {
        if (!fs.statSync(path).isFile()) {
            const string = "File " + path + " is not found" + (assertString.length > 0 ? ": " + assertString : "");
            if (!soft) {
                throw new Error(string);
            }
            console.warn(string);
            return false;
        }
    } catch (e) {
        return false;
    }
    return true;
}


export function ensureStringLength(str: string, requiredLength: number, fillWith: string = "0"): string {
    if (str.length < requiredLength) {
        return str.padStart(requiredLength, fillWith);
    } else if (str.length > requiredLength) {
        return str.slice(0, requiredLength);
    }
    return str;
}


export function withResolvers() {
    let resolve: any;
    let reject: any;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}


export function splitBufferBy(buffer: Buffer, size: number): Buffer[] {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += size) {
        chunks.push(buffer.slice(i, i + size));
    }
    return chunks;
}