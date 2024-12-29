// thanks to https://github.com/taoyuan/mutable-buffer/

const DEFAULT_INITIAL_SIZE = 1024;
const DEFAULT_BLOCK_SIZE = 1024;

type WriteData = BaseMutableBuffer | string | Buffer | ArrayLike<number> | ArrayBuffer | SharedArrayBuffer;


export class BaseMutableBuffer {
	static readonly target: string;

	protected _initialSize: number;
	protected _blockSize: number;
	protected _size: number;
	protected _buffer: Buffer;


	constructor(size?: number, blockSize?: number) {
		this._initialSize = size ?? DEFAULT_INITIAL_SIZE;
		this._blockSize = blockSize ?? DEFAULT_BLOCK_SIZE;

		this._buffer = this.Buffer.allocUnsafe(this._initialSize);
		this._size = 0;
	}

	get size() {
		return this._size;
	}


	get buffer(): Buffer {
		return this._buffer;
	}

	get Buffer(): typeof Buffer {
		return (<any>this.constructor).Buffer;
	}

	static create(size?: number, blockSize?: number) {
		return new this(size, blockSize);
	}

	//resize internal buffer if not enough size left
	_ensure(size: number) {
		const remaining = this._buffer.length - this._size;
		if (remaining < size) {
			const factor = Math.ceil((size - remaining) / this._blockSize);

			const prev = this._buffer;
			this._buffer = this.Buffer.allocUnsafe(prev.length + this._blockSize * factor);
			prev.copy(this._buffer);
		}
	}

	capacity() {
		return this._buffer.length;
	}

	cloneNativeBuffer() {
		return this._buffer.subarray(0, this._size);
	}

	clear() {
		this._size = 0;
	}

	destroy() {
		this._buffer = this.Buffer.allocUnsafe(0);
		this._size = 0;
	}



	/**
	 *
	 * @param targetOrCreate The target buffer or creating or slice buffer.
	 *    1. Buffer: The target buffer to render;
	 *    2. true: Create new buffer and copy all cached data to it;
	 *    3  false: Slice the cached data from internal buffer, The result cloud be be changed if current MutableBuffer has been reused.
	 */
	render(targetOrCreate?: Buffer | boolean): Buffer {
		if (targetOrCreate) {
			const answer = isBuffer(targetOrCreate) ? targetOrCreate : this.Buffer.allocUnsafe(this.size);
			this._buffer.copy(answer, 0, 0, this._size);
			return answer;
		}
		return this._buffer.subarray(0, this._size);
	}

	flush(targetOrCreate?: Buffer | boolean) {
		const result = this.render(targetOrCreate);
		this.clear();
		return result;
	}

	flushAndDestory(): Buffer {
		const result = this.flush(true);
		this.destroy();
		return result;
	}


	write(source: WriteData, encoding?: BufferEncoding): number;
	write(source: WriteData, ...args: any[]): number;
	write(source: WriteData, ...args: any[]): number {
		if (isBuffer(source)) {
			this._ensure(source.length);
			source.copy(this._buffer, this._size);
			this._size += source.length;
		} else if (Array.isArray(source)) {
			this._ensure(source.length);
			for (let i = 0; i < source.length; i++) {
				this._buffer[this._size + i] = source[i];
			}
			this._size += source.length;
		} else if (isMutableBuffer(source)) {
			this._ensure(source.size);
			source.buffer.copy(this._buffer, this._size);
			this._size += source.size;
		} else {
			const last = args.length > 0 ? args[args.length - 1] : undefined;
			const encoding = typeof last === 'string' ? (last as BufferEncoding) : undefined;
			source = source + '';
			const len = this.Buffer.byteLength(source, encoding);
			this._ensure(len);
			this._buffer.write(source, this._size, len, encoding);
			this._size += len;
		}
		return this.size;
	}

	writeCString(data?: string | Buffer, encoding?: BufferEncoding) {
		//just write a 0 for empty or null strings
		if (!data) {
			this._ensure(1);
		} else if (isBuffer(data)) {
			this._ensure(data.length);
			data.copy(this._buffer, this._size);
			this._size += data.length;
		} else {
			const len = this.Buffer.byteLength(data, encoding);
			this._ensure(len + 1); //+1 for null terminator
			this._buffer.write(data, this._size, len, encoding);
			this._size += len;
		}

		this._buffer[this._size++] = 0; // null terminator
		return this.size;
	}

	writeChar(c: string) {
		this._ensure(1);
		this._buffer.write(c, this._size, 1);
		this._size++;
		return this.size;
	}

	writeUIntLE(value: number, byteLength: number) {
		this._ensure(byteLength >>> 0);
		this._size = this._buffer.writeUIntLE(value, this._size, byteLength);
		return this.size;
	}

	writeUIntBE(value: number, byteLength: number) {
		this._ensure(byteLength >>> 0);
		this._size = this._buffer.writeUIntBE(value, this._size, byteLength);
		return this.size;
	}

	writeUInt8(value: number) {
		this._ensure(1);
		this._size = this._buffer.writeUInt8(value, this._size);
		return this.size;
	}

	writeUInt16LE(value: number) {
		this._ensure(2);
		this._size = this._buffer.writeUInt16LE(value, this._size);
		return this.size;
	}

	writeUInt16BE(value: number) {
		this._ensure(2);
		this._size = this._buffer.writeUInt16BE(value, this._size);
		return this.size;
	}

	writeUInt32LE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeUInt32LE(value, this._size);
		return this.size;
	}

	writeUInt32BE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeUInt32BE(value, this._size);
		return this.size;
	}

	writeIntLE(value: number, byteLength: number) {
		this._ensure(byteLength >>> 0);
		this._size = this._buffer.writeIntLE(value, this._size, byteLength);
		return this.size;
	}

	writeIntBE(value: number, byteLength: number) {
		this._ensure(byteLength >>> 0);
		this._size = this._buffer.writeIntBE(value, this._size, byteLength);
		return this.size;
	}

	writeInt8(value: number) {
		this._ensure(1);
		this._size = this._buffer.writeInt8(value, this._size);
		return this.size;
	}

	writeInt16LE(value: number) {
		this._ensure(2);
		this._size = this._buffer.writeInt16LE(value, this._size);
		return this.size;
	}

	writeInt16BE(value: number) {
		this._ensure(2);
		this._size = this._buffer.writeInt16BE(value, this._size);
		return this.size;
	}

	writeInt32LE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeInt32LE(value, this._size);
		return this.size;
	}

	writeInt32BE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeInt32BE(value, this._size);
		return this.size;
	}

	writeFloatLE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeFloatLE(value, this._size);
		return this.size;
	}

	writeFloatBE(value: number) {
		this._ensure(4);
		this._size = this._buffer.writeFloatBE(value, this._size);
		return this.size;
	}

	writeDoubleLE(value: number) {
		this._ensure(8);
		this._size = this._buffer.writeDoubleLE(value, this._size);
		return this.size;
	}

	writeDoubleBE(value: number) {
		this._ensure(8);
		this._size = this._buffer.writeDoubleBE(value, this._size);
		return this.size;
	}


	trim() {
		if (this.size <= 0) {
			return this.size;
		}

		let begin = 0;
		let end = 0;

		for (let i = 0; i < this.size; i++) {
			if (this._buffer[i]) {
				begin = i;
				break;
			}
		}

		for (let i = this.size; i > 0; i--) {
			if (this._buffer[i - 1]) {
				end = i;
				break;
			}
		}

		if (begin === 0 && end === this.size) {
			return this.size;
		}

		this._buffer = this._buffer.subarray(begin, end);
		this._size = end - begin;
		return this.size;
	}

	trimLeft() {
		if (this.size <= 0 || this._buffer[0]) {
			return this.size;
		}

		for (let i = 0; i < this.size; i++) {
			if (this._buffer[i]) {
				this._buffer = this._buffer.subarray(i);
				this._size = this.size - i;
				return this.size;
			}
		}
		if (this.size > 0) {
			this._size = 0;
		}
		return this.size;
	}

	trimRight() {
		if (this.size <= 0 || this._buffer[this.size - 1]) {
			return this.size;
		}

		for (let i = this.size; i > 0; i--) {
			if (this._buffer[i - 1]) {
				this._buffer = this._buffer.subarray(0, i);
				this._size = i;
				return this.size;
			}
		}

		if (this.size > 0) {
			this._size = 0;
		}
		return this.size;
	}
}

export default class MutableBuffer extends BaseMutableBuffer {
	static readonly target = 'node';
	static Buffer = Buffer;
}

function isBuffer(obj: any): obj is Buffer {
	return typeof obj?.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj);
}

function isMutableBuffer(obj: any): obj is BaseMutableBuffer {
	return obj?.buffer && obj.size && typeof obj.render === 'function';
}