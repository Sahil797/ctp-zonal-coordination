'use strict';
const crypto = require('crypto');

function id(prefix) {
  return `${prefix || 'id'}_${crypto.randomBytes(8).toString('hex')}`;
}

function now() {
  return new Date().toISOString();
}

function str(value, max) {
  if (value === null || value === undefined) return '';
  const out = String(value).trim();
  return max ? out.slice(0, max) : out;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function int(value, fallback) {
  return Math.round(num(value, fallback === undefined ? 0 : fallback));
}

function bool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

function oneOf(value, allowed, fallback) {
  const v = str(value).toLowerCase();
  const hit = allowed.find((a) => a.toLowerCase() === v);
  return hit || fallback;
}

function email(value) {
  const v = str(value, 160).toLowerCase();
  if (!v) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : '';
}

function phone(value) {
  return str(value, 24).replace(/[^\d+\-\s()]/g, '');
}

function dateOnly(value) {
  const v = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function person(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    name: str(src.name, 120),
    email: email(src.email),
    phone: phone(src.phone)
  };
}

function slug(value) {
  return str(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function fail(status, message, details) {
  throw new HttpError(status, message, details);
}

/** Wraps an async express handler so rejections reach the error middleware. */
function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function csvCell(value) {
  const v = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(',')).join('\r\n');
  return `${head}\r\n${body}\r\n`;
}

function paginate(list, query) {
  const page = Math.max(1, int(query.page, 1));
  const size = Math.min(500, Math.max(1, int(query.pageSize, 100)));
  const start = (page - 1) * size;
  return { page, pageSize: size, total: list.length, items: list.slice(start, start + size) };
}

module.exports = {
  id, now, str, num, int, bool, oneOf, email, phone, dateOnly, person, slug,
  HttpError, fail, wrap, toCsv, csvCell, paginate
};
