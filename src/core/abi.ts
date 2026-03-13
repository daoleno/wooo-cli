import { isAddress } from "viem";

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prev = input[i - 1];

    if (quote) {
      current += char;
      if (char === quote && prev !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depthParen++;
    if (char === ")") depthParen--;
    if (char === "[") depthBracket++;
    if (char === "]") depthBracket--;
    if (char === "{") depthBrace++;
    if (char === "}") depthBrace--;

    if (
      char === "," &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      const trimmed = current.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  return parts;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function splitAbiTypes(inputTypes: string): string[] {
  const trimmed = inputTypes.trim();
  if (!trimmed) {
    return [];
  }
  return splitTopLevel(trimmed);
}

export function splitCallArguments(rawArgs?: string): string[] {
  if (!rawArgs?.trim()) {
    return [];
  }
  return splitTopLevel(rawArgs);
}

export function parseAbiArgument(type: string, rawValue: string): unknown {
  const trimmedType = type.trim();
  const trimmedValue = rawValue.trim();

  const arrayMatch = trimmedType.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch) {
    if (!trimmedValue.startsWith("[") || !trimmedValue.endsWith("]")) {
      throw new Error(
        `Array argument for type ${trimmedType} must use JSON-style brackets`,
      );
    }

    const innerType = arrayMatch[1];
    const expectedLength = arrayMatch[2] ? Number(arrayMatch[2]) : null;
    const items = splitTopLevel(trimmedValue.slice(1, -1));
    if (expectedLength !== null && items.length !== expectedLength) {
      throw new Error(
        `Array argument for type ${trimmedType} must contain ${expectedLength} items`,
      );
    }
    return items.map((item) => parseAbiArgument(innerType, item));
  }

  if (trimmedType === "address") {
    const value = stripQuotes(trimmedValue);
    if (!isAddress(value)) {
      throw new Error(`Invalid address argument: ${rawValue}`);
    }
    return value;
  }

  if (trimmedType === "bool") {
    const value = stripQuotes(trimmedValue).toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Invalid bool argument: ${rawValue}`);
  }

  if (/^u?int\d*$/.test(trimmedType)) {
    const value = stripQuotes(trimmedValue);
    if (!/^-?\d+$/.test(value)) {
      throw new Error(
        `Invalid integer argument for ${trimmedType}: ${rawValue}`,
      );
    }
    if (trimmedType.startsWith("uint") && value.startsWith("-")) {
      throw new Error(`Unsigned integer cannot be negative: ${rawValue}`);
    }
    return BigInt(value);
  }

  if (/^bytes(\d+)?$/.test(trimmedType)) {
    const value = stripQuotes(trimmedValue);
    if (!/^0x[0-9a-fA-F]*$/.test(value)) {
      throw new Error(`Invalid bytes argument: ${rawValue}`);
    }
    return value;
  }

  if (trimmedType === "string") {
    return stripQuotes(trimmedValue);
  }

  throw new Error(
    `Unsupported ABI argument type: ${trimmedType}. Supported: address, bool, string, bytes, int/uint, arrays`,
  );
}

export function parseAbiArguments(
  inputTypes: string,
  rawArgs?: string,
): unknown[] {
  const types = splitAbiTypes(inputTypes);
  const args = splitCallArguments(rawArgs);

  if (args.length !== types.length) {
    throw new Error(
      `Expected ${types.length} argument(s) but received ${args.length}`,
    );
  }

  return types.map((type, index) => parseAbiArgument(type, args[index]));
}
