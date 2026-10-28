'use strict';

/** Escapes user input so it can be used safely as a literal inside a RegExp. */
module.exports = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
