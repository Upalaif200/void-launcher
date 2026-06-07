'use strict';

const MAX_STRING = 500;
const MAX_ID = 100;
const MAX_PATH = 500;
const MAX_PASSWORD = 128;
const MAX_MESSAGE = 5000;

function sanitizeString(val, maxLen = MAX_STRING) {
    if (typeof val !== 'string') return '';
    return val.replace(/\0/g, '').slice(0, maxLen);
}

function sanitizeBoolean(val) {
    return typeof val === 'boolean' ? val : false;
}

function sanitizeId(val) {
    if (typeof val !== 'string') return '';
    return val.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_ID);
}

function sanitizePath(val) {
    if (typeof val !== 'string') return '';
    return val.replace(/\0/g, '').slice(0, MAX_PATH);
}

function sanitizePayload(payload, schema) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const result = {};
    for (const [key, rules] of Object.entries(schema)) {
        const val = payload[key];
        if (val === undefined && rules.default !== undefined) {
            result[key] = rules.default;
            continue;
        }
        if (val === undefined) continue;
        switch (rules.type) {
            case 'string':
                result[key] = sanitizeString(val, rules.max || MAX_STRING);
                break;
            case 'boolean':
                result[key] = sanitizeBoolean(val);
                break;
            case 'id':
                result[key] = sanitizeId(val);
                break;
            case 'path':
                result[key] = sanitizePath(val);
                break;
            case 'password':
                result[key] = sanitizeString(val, rules.max || MAX_PASSWORD);
                break;
            case 'message':
                result[key] = sanitizeString(val, rules.max || MAX_MESSAGE);
                break;
            case 'number':
                result[key] = typeof val === 'number' && !Number.isNaN(val) ? val : (rules.default || 0);
                break;
            case 'any':
                result[key] = val;
                break;
            default:
                result[key] = val;
        }
    }
    return result;
}

module.exports = { sanitizeString, sanitizeBoolean, sanitizeId, sanitizePath, sanitizePayload };
