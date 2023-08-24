'use strict';

/**
 * ClientResponseError is a custom Error class that is intended to wrap
 * and normalize any error thrown by `Client.send()`.
 */
class ClientResponseError extends Error {
    constructor(errData) {
        super("ClientResponseError");
        this.url = '';
        this.status = 0;
        this.response = {};
        this.isAbort = false;
        this.originalError = null;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, ClientResponseError.prototype);
        if (errData !== null && typeof errData === 'object') {
            this.url = typeof errData.url === 'string' ? errData.url : '';
            this.status = typeof errData.status === 'number' ? errData.status : 0;
            this.isAbort = !!errData.isAbort;
            this.originalError = errData.originalError;
            if (errData.response !== null && typeof errData.response === 'object') {
                this.response = errData.response;
            }
            else if (errData.data !== null && typeof errData.data === 'object') {
                this.response = errData.data;
            }
            else {
                this.response = {};
            }
        }
        if (!this.originalError && !(errData instanceof ClientResponseError)) {
            this.originalError = errData;
        }
        if (typeof DOMException !== 'undefined' && errData instanceof DOMException) {
            this.isAbort = true;
        }
        this.name = "ClientResponseError " + this.status;
        this.message = this.response?.message;
        if (!this.message) {
            if (this.isAbort) {
                this.message = 'The request was autocancelled.';
            }
            else if (this.originalError?.cause?.message?.includes("ECONNREFUSED ::1")) {
                this.message = 'Failed to connect to the CoddySpace server. Try changing the SDK URL from localhost to 127.0.0.1.';
            }
            else {
                this.message = 'Something went wrong while processing your request.';
            }
        }
    }
    /**
     * Alias for `this.response` to preserve the backward compatibility.
     */
    get data() {
        return this.response;
    }
    /**
     * Make a POJO's copy of the current error class instance.
     */
    toJSON() {
        return { ...this };
    }
}

/**
 * -------------------------------------------------------------------
 * Simple cookie parse and serialize utilities mostly based on the
 * node module https://github.com/jshttp/cookie.
 * -------------------------------------------------------------------
 */
/**
 * RegExp to match field-content in RFC 7230 sec 3.2
 *
 * field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 * field-vchar   = VCHAR / obs-text
 * obs-text      = %x80-FF
 */
const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
/**
* Parses the given cookie header string into an object
* The object has the various cookies as keys(names) => values
*/
function cookieParse(str, options) {
    const result = {};
    if (typeof str !== 'string') {
        return result;
    }
    const opt = Object.assign({}, options || {});
    const decode = opt.decode || defaultDecode;
    let index = 0;
    while (index < str.length) {
        const eqIdx = str.indexOf('=', index);
        // no more cookie pairs
        if (eqIdx === -1) {
            break;
        }
        let endIdx = str.indexOf(';', index);
        if (endIdx === -1) {
            endIdx = str.length;
        }
        else if (endIdx < eqIdx) {
            // backtrack on prior semicolon
            index = str.lastIndexOf(';', eqIdx - 1) + 1;
            continue;
        }
        const key = str.slice(index, eqIdx).trim();
        // only assign once
        if (undefined === result[key]) {
            let val = str.slice(eqIdx + 1, endIdx).trim();
            // quoted values
            if (val.charCodeAt(0) === 0x22) {
                val = val.slice(1, -1);
            }
            try {
                result[key] = decode(val);
            }
            catch (_) {
                result[key] = val; // no decoding
            }
        }
        index = endIdx + 1;
    }
    return result;
}
/**
 * Serialize data into a cookie header.
 *
 * Serialize the a name value pair into a cookie string suitable for
 * http headers. An optional options object specified cookie parameters.
 *
 * ```js
 * cookieSerialize('foo', 'bar', { httpOnly: true }) // "foo=bar; httpOnly"
 * ```
 */
function cookieSerialize(name, val, options) {
    const opt = Object.assign({}, options || {});
    const encode = opt.encode || defaultEncode;
    if (!fieldContentRegExp.test(name)) {
        throw new TypeError('argument name is invalid');
    }
    const value = encode(val);
    if (value && !fieldContentRegExp.test(value)) {
        throw new TypeError('argument val is invalid');
    }
    let result = name + '=' + value;
    if (opt.maxAge != null) {
        const maxAge = opt.maxAge - 0;
        if (isNaN(maxAge) || !isFinite(maxAge)) {
            throw new TypeError('option maxAge is invalid');
        }
        result += '; Max-Age=' + Math.floor(maxAge);
    }
    if (opt.domain) {
        if (!fieldContentRegExp.test(opt.domain)) {
            throw new TypeError('option domain is invalid');
        }
        result += '; Domain=' + opt.domain;
    }
    if (opt.path) {
        if (!fieldContentRegExp.test(opt.path)) {
            throw new TypeError('option path is invalid');
        }
        result += '; Path=' + opt.path;
    }
    if (opt.expires) {
        if (!isDate(opt.expires) || isNaN(opt.expires.valueOf())) {
            throw new TypeError('option expires is invalid');
        }
        result += '; Expires=' + opt.expires.toUTCString();
    }
    if (opt.httpOnly) {
        result += '; HttpOnly';
    }
    if (opt.secure) {
        result += '; Secure';
    }
    if (opt.priority) {
        const priority = typeof opt.priority === 'string' ? opt.priority.toLowerCase() : opt.priority;
        switch (priority) {
            case 'low':
                result += '; Priority=Low';
                break;
            case 'medium':
                result += '; Priority=Medium';
                break;
            case 'high':
                result += '; Priority=High';
                break;
            default:
                throw new TypeError('option priority is invalid');
        }
    }
    if (opt.sameSite) {
        const sameSite = typeof opt.sameSite === 'string' ? opt.sameSite.toLowerCase() : opt.sameSite;
        switch (sameSite) {
            case true:
                result += '; SameSite=Strict';
                break;
            case 'lax':
                result += '; SameSite=Lax';
                break;
            case 'strict':
                result += '; SameSite=Strict';
                break;
            case 'none':
                result += '; SameSite=None';
                break;
            default:
                throw new TypeError('option sameSite is invalid');
        }
    }
    return result;
}
/**
 * Default URL-decode string value function.
 * Optimized to skip native call when no `%`.
 */
function defaultDecode(val) {
    return val.indexOf('%') !== -1
        ? decodeURIComponent(val)
        : val;
}
/**
 * Default URL-encode value function.
 */
function defaultEncode(val) {
    return encodeURIComponent(val);
}
/**
 * Determines if value is a Date.
 */
function isDate(val) {
    return (Object.prototype.toString.call(val) === '[object Date]' ||
        val instanceof Date);
}

let atobPolyfill;
if (typeof atob === 'function') {
    atobPolyfill = atob;
}
else {
    /**
     * The code was extracted from:
     * https://github.com/davidchambers/Base64.js
     */
    atobPolyfill = (input) => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        let str = String(input).replace(/=+$/, "");
        if (str.length % 4 == 1) {
            throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
        }
        for (
        // initialize result and counters
        var bc = 0, bs, buffer, idx = 0, output = ""; 
        // get next character
        (buffer = str.charAt(idx++)); 
        // character found in table? initialize bit storage and add its ascii value;
        ~buffer &&
            ((bs = bc % 4 ? bs * 64 + buffer : buffer),
                // and if not first of each 4 characters,
                // convert the first 8 bits to one ascii character
                bc++ % 4) ?
            (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) :
            0) {
            // try to find character in table (0-63, not found => -1)
            buffer = chars.indexOf(buffer);
        }
        return output;
    };
}
/**
 * Returns JWT token's payload data.
 */
function getTokenPayload(token) {
    if (token) {
        try {
            const encodedPayload = decodeURIComponent(atobPolyfill(token.split('.')[1]).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(encodedPayload) || {};
        }
        catch (e) {
        }
    }
    return {};
}
/**
 * Checks whether a JWT token is expired or not.
 * Tokens without `exp` payload key are considered valid.
 * Tokens with empty payload (eg. invalid token strings) are considered expired.
 *
 * @param token The token to check.
 * @param [expirationThreshold] Time in seconds that will be subtracted from the token `exp` property.
 */
function isTokenExpired(token, expirationThreshold = 0) {
    let payload = getTokenPayload(token);
    if (Object.keys(payload).length > 0 &&
        (!payload.exp || (payload.exp - expirationThreshold) > (Date.now() / 1000))) {
        return false;
    }
    return true;
}

const defaultCookieKey = 'pb_auth';
/**
 * Base AuthStore class that is intended to be extended by all other
 * CoddySpace AuthStore implementations.
 */
class BaseAuthStore {
    constructor() {
        this.baseToken = '';
        this.baseModel = null;
        this._onChangeCallbacks = [];
    }
    /**
     * Retrieves the stored token (if any).
     */
    get token() {
        return this.baseToken;
    }
    /**
     * Retrieves the stored model data (if any).
     */
    get model() {
        return this.baseModel;
    }
    /**
     * Loosely checks if the store has valid token (aka. existing and unexpired exp claim).
     */
    get isValid() {
        return !isTokenExpired(this.token);
    }
    /**
     * Checks whether the current store state is for admin authentication.
     */
    get isAdmin() {
        return getTokenPayload(this.token).type === "admin";
    }
    /**
     * Checks whether the current store state is for auth record authentication.
     */
    get isAuthRecord() {
        return getTokenPayload(this.token).type === "authRecord";
    }
    /**
     * Saves the provided new token and model data in the auth store.
     */
    save(token, model) {
        this.baseToken = token || '';
        this.baseModel = model || null;
        this.triggerChange();
    }
    /**
     * Removes the stored token and model data form the auth store.
     */
    clear() {
        this.baseToken = '';
        this.baseModel = null;
        this.triggerChange();
    }
    /**
     * Parses the provided cookie string and updates the store state
     * with the cookie's token and model data.
     *
     * NB! This function doesn't validate the token or its data.
     * Usually this isn't a concern if you are interacting only with the
     * CoddySpace API because it has the proper server-side security checks in place,
     * but if you are using the store `isValid` state for permission controls
     * in a node server (eg. SSR), then it is recommended to call `authRefresh()`
     * after loading the cookie to ensure an up-to-date token and model state.
     * For example:
     *
     * ```js
     * pb.authStore.loadFromCookie("cookie string...");
     *
     * try {
     *     // get an up-to-date auth store state by veryfing and refreshing the loaded auth model (if any)
     *     pb.authStore.isValid && await pb.collection('users').authRefresh();
     * } catch (_) {
     *     // clear the auth store on failed refresh
     *     pb.authStore.clear();
     * }
     * ```
     */
    loadFromCookie(cookie, key = defaultCookieKey) {
        const rawData = cookieParse(cookie || '')[key] || '';
        let data = {};
        try {
            data = JSON.parse(rawData);
            // normalize
            if (typeof data === null || typeof data !== 'object' || Array.isArray(data)) {
                data = {};
            }
        }
        catch (_) { }
        this.save(data.token || '', data.model || null);
    }
    /**
     * Exports the current store state as cookie string.
     *
     * By default the following optional attributes are added:
     * - Secure
     * - HttpOnly
     * - SameSite=Strict
     * - Path=/
     * - Expires={the token expiration date}
     *
     * NB! If the generated cookie exceeds 4096 bytes, this method will
     * strip the model data to the bare minimum to try to fit within the
     * recommended size in https://www.rfc-editor.org/rfc/rfc6265#section-6.1.
     */
    exportToCookie(options, key = defaultCookieKey) {
        const defaultOptions = {
            secure: true,
            sameSite: true,
            httpOnly: true,
            path: "/",
        };
        // extract the token expiration date
        const payload = getTokenPayload(this.token);
        if (payload?.exp) {
            defaultOptions.expires = new Date(payload.exp * 1000);
        }
        else {
            defaultOptions.expires = new Date('1970-01-01');
        }
        // merge with the user defined options
        options = Object.assign({}, defaultOptions, options);
        const rawData = {
            token: this.token,
            model: this.model ? JSON.parse(JSON.stringify(this.model)) : null,
        };
        let result = cookieSerialize(key, JSON.stringify(rawData), options);
        const resultLength = typeof Blob !== 'undefined' ?
            (new Blob([result])).size : result.length;
        // strip down the model data to the bare minimum
        if (rawData.model && resultLength > 4096) {
            rawData.model = { id: rawData?.model?.id, email: rawData?.model?.email };
            const extraProps = ["collectionId", "username", "verified"];
            for (const prop in this.model) {
                if (extraProps.includes(prop)) {
                    rawData.model[prop] = this.model[prop];
                }
            }
            result = cookieSerialize(key, JSON.stringify(rawData), options);
        }
        return result;
    }
    /**
     * Register a callback function that will be called on store change.
     *
     * You can set the `fireImmediately` argument to true in order to invoke
     * the provided callback right after registration.
     *
     * Returns a removal function that you could call to "unsubscribe" from the changes.
     */
    onChange(callback, fireImmediately = false) {
        this._onChangeCallbacks.push(callback);
        if (fireImmediately) {
            callback(this.token, this.model);
        }
        return () => {
            for (let i = this._onChangeCallbacks.length - 1; i >= 0; i--) {
                if (this._onChangeCallbacks[i] == callback) {
                    delete this._onChangeCallbacks[i]; // removes the function reference
                    this._onChangeCallbacks.splice(i, 1); // reindex the array
                    return;
                }
            }
        };
    }
    triggerChange() {
        for (const callback of this._onChangeCallbacks) {
            callback && callback(this.token, this.model);
        }
    }
}

/**
 * The default token store for browsers with auto fallback
 * to runtime/memory if local storage is undefined (eg. in node env).
 */
class LocalAuthStore extends BaseAuthStore {
    constructor(storageKey = "coddyspace_auth") {
        super();
        this.storageFallback = {};
        this.storageKey = storageKey;
        this._bindStorageEvent();
    }
    /**
     * @inheritdoc
     */
    get token() {
        const data = this._storageGet(this.storageKey) || {};
        return data.token || '';
    }
    /**
     * @inheritdoc
     */
    get model() {
        const data = this._storageGet(this.storageKey) || {};
        return data.model || null;
    }
    /**
     * @inheritdoc
     */
    save(token, model) {
        this._storageSet(this.storageKey, {
            'token': token,
            'model': model,
        });
        super.save(token, model);
    }
    /**
     * @inheritdoc
     */
    clear() {
        this._storageRemove(this.storageKey);
        super.clear();
    }
    // ---------------------------------------------------------------
    // Internal helpers:
    // ---------------------------------------------------------------
    /**
     * Retrieves `key` from the browser's local storage
     * (or runtime/memory if local storage is undefined).
     */
    _storageGet(key) {
        if (typeof window !== 'undefined' && window?.localStorage) {
            const rawValue = window.localStorage.getItem(key) || '';
            try {
                return JSON.parse(rawValue);
            }
            catch (e) { // not a json
                return rawValue;
            }
        }
        // fallback
        return this.storageFallback[key];
    }
    /**
     * Stores a new data in the browser's local storage
     * (or runtime/memory if local storage is undefined).
     */
    _storageSet(key, value) {
        if (typeof window !== 'undefined' && window?.localStorage) {
            // store in local storage
            let normalizedVal = value;
            if (typeof value !== 'string') {
                normalizedVal = JSON.stringify(value);
            }
            window.localStorage.setItem(key, normalizedVal);
        }
        else {
            // store in fallback
            this.storageFallback[key] = value;
        }
    }
    /**
     * Removes `key` from the browser's local storage and the runtime/memory.
     */
    _storageRemove(key) {
        // delete from local storage
        if (typeof window !== 'undefined' && window?.localStorage) {
            window.localStorage?.removeItem(key);
        }
        // delete from fallback
        delete this.storageFallback[key];
    }
    /**
     * Updates the current store state on localStorage change.
     */
    _bindStorageEvent() {
        if (typeof window === 'undefined' || !window?.localStorage || !window.addEventListener) {
            return;
        }
        window.addEventListener('storage', (e) => {
            if (e.key != this.storageKey) {
                return;
            }
            const data = this._storageGet(this.storageKey) || {};
            super.save(data.token || '', data.model || null);
        });
    }
}

/**
 * BaseService class that should be inherited from all API services.
 */
class BaseService {
    constructor(client) {
        this.client = client;
    }
}

class SettingsService extends BaseService {
    /**
     * Fetch all available app settings.
     */
    getAll(options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send('/api/settings', options);
    }
    /**
     * Bulk updates app settings.
     */
    update(bodyParams, options) {
        options = Object.assign({
            'method': 'PATCH',
            'body': bodyParams,
        }, options);
        return this.client.send('/api/settings', options);
    }
    /**
     * Performs a S3 filesystem connection test.
     *
     * The currently supported `filesystem` are "storage" and "backups".
     */
    testS3(filesystem = "storage", options) {
        options = Object.assign({
            'method': 'POST',
            'body': {
                'filesystem': filesystem,
            },
        }, options);
        return this.client.send('/api/settings/test/s3', options)
            .then(() => true);
    }
    /**
     * Sends a test email.
     *
     * The possible `emailTemplate` values are:
     * - verification
     * - password-reset
     * - email-change
     */
    testEmail(toEmail, emailTemplate, options) {
        options = Object.assign({
            'method': 'POST',
            'body': {
                'email': toEmail,
                'template': emailTemplate,
            },
        }, options);
        return this.client.send('/api/settings/test/email', options)
            .then(() => true);
    }
    /**
     * Generates a new Apple OAuth2 client secret.
     */
    generateAppleClientSecret(clientId, teamId, keyId, privateKey, duration, options) {
        options = Object.assign({
            'method': 'POST',
            'body': {
                clientId,
                teamId,
                keyId,
                privateKey,
                duration,
            },
        }, options);
        return this.client.send('/api/settings/apple/generate-client-secret', options);
    }
}

class CrudService extends BaseService {
    /**
     * Response data decoder.
     */
    decode(data) {
        return data;
    }
    getFullList(batchOrqueryParams, options) {
        if (typeof batchOrqueryParams == "number") {
            return this._getFullList(batchOrqueryParams, options);
        }
        options = Object.assign({}, batchOrqueryParams, options);
        let batch = 500;
        if (options.batch) {
            batch = options.batch;
            delete options.batch;
        }
        return this._getFullList(batch, options);
    }
    /**
     * Returns paginated items list.
     *
     * You can use the generic T to supply a wrapper type of the crud model.
     */
    getList(page = 1, perPage = 30, options) {
        options = Object.assign({
            method: 'GET'
        }, options);
        options.query = Object.assign({
            'page': page,
            'perPage': perPage,
        }, options.query);
        return this.client.send(this.baseCrudPath, options)
            .then((responseData) => {
            responseData.items = responseData.items?.map((item) => {
                return this.decode(item);
            }) || [];
            return responseData;
        });
    }
    /**
     * Returns the first found item by the specified filter.
     *
     * Internally it calls `getList(1, 1, { filter, skipTotal })` and
     * returns the first found item.
     *
     * You can use the generic T to supply a wrapper type of the crud model.
     *
     * For consistency with `getOne`, this method will throw a 404
     * ClientResponseError if no item was found.
     */
    getFirstListItem(filter, options) {
        options = Object.assign({
            'requestKey': 'one_by_filter_' + this.baseCrudPath + "_" + filter,
        }, options);
        options.query = Object.assign({
            'filter': filter,
            'skipTotal': 1,
        }, options.query);
        return this.getList(1, 1, options)
            .then((result) => {
            if (!result?.items?.length) {
                throw new ClientResponseError({
                    status: 404,
                    data: {
                        code: 404,
                        message: "The requested resource wasn't found.",
                        data: {},
                    },
                });
            }
            return result.items[0];
        });
    }
    /**
     * Returns single item by its id.
     *
     * You can use the generic T to supply a wrapper type of the crud model.
     */
    getOne(id, options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send(this.baseCrudPath + '/' + encodeURIComponent(id), options)
            .then((responseData) => this.decode(responseData));
    }
    /**
     * Creates a new item.
     *
     * You can use the generic T to supply a wrapper type of the crud model.
     */
    create(bodyParams, options) {
        options = Object.assign({
            'method': 'POST',
            'body': bodyParams,
        }, options);
        return this.client.send(this.baseCrudPath, options)
            .then((responseData) => this.decode(responseData));
    }
    /**
     * Updates an existing item by its id.
     *
     * You can use the generic T to supply a wrapper type of the crud model.
     */
    update(id, bodyParams, options) {
        options = Object.assign({
            'method': 'PATCH',
            'body': bodyParams,
        }, options);
        return this.client.send(this.baseCrudPath + '/' + encodeURIComponent(id), options)
            .then((responseData) => this.decode(responseData));
    }
    /**
     * Deletes an existing item by its id.
     */
    delete(id, options) {
        options = Object.assign({
            'method': 'DELETE',
        }, options);
        return this.client.send(this.baseCrudPath + '/' + encodeURIComponent(id), options)
            .then(() => true);
    }
    /**
     * Returns a promise with all list items batch fetched at once.
     */
    _getFullList(batchSize = 500, options) {
        options = options || {};
        options.query = Object.assign({
            'skipTotal': 1,
        }, options.query);
        let result = [];
        let request = async (page) => {
            return this.getList(page, batchSize || 500, options).then((list) => {
                const castedList = list;
                const items = castedList.items;
                result = result.concat(items);
                if (items.length == list.perPage) {
                    return request(page + 1);
                }
                return result;
            });
        };
        return request(1);
    }
}

function normalizeLegacyOptionsArgs(legacyWarn, baseOptions, bodyOrOptions, query) {
    const hasBodyOrOptions = typeof bodyOrOptions !== 'undefined';
    const hasQuery = typeof query !== 'undefined';
    if (!hasQuery && !hasBodyOrOptions) {
        return baseOptions;
    }
    if (hasQuery) {
        console.warn(legacyWarn);
        baseOptions.body = Object.assign({}, baseOptions.body, bodyOrOptions);
        baseOptions.query = Object.assign({}, baseOptions.query, query);
        return baseOptions;
    }
    baseOptions = Object.assign(baseOptions, bodyOrOptions);
    return baseOptions;
}

class AdminService extends CrudService {
    /**
     * @inheritdoc
     */
    get baseCrudPath() {
        return '/api/admins';
    }
    // ---------------------------------------------------------------
    // Post update/delete AuthStore sync
    // ---------------------------------------------------------------
    /**
     * @inheritdoc
     *
     * If the current `client.authStore.model` matches with the updated id, then
     * on success the `client.authStore.model` will be updated with the result.
     */
    update(id, bodyParams, options) {
        return super.update(id, bodyParams, options).then((item) => {
            // update the store state if the updated item id matches with the stored model
            if (this.client.authStore.model?.id === item.id &&
                typeof this.client.authStore.model?.collectionId === 'undefined' // is not record auth
            ) {
                this.client.authStore.save(this.client.authStore.token, item);
            }
            return item;
        });
    }
    /**
     * @inheritdoc
     *
     * If the current `client.authStore.model` matches with the deleted id,
     * then on success the `client.authStore` will be cleared.
     */
    delete(id, options) {
        return super.delete(id, options).then((success) => {
            // clear the store state if the deleted item id matches with the stored model
            if (success &&
                this.client.authStore.model?.id === id &&
                typeof this.client.authStore.model?.collectionId === 'undefined' // is not record auth
            ) {
                this.client.authStore.clear();
            }
            return success;
        });
    }
    // ---------------------------------------------------------------
    // Auth handlers
    // ---------------------------------------------------------------
    /**
     * Prepare successful authorize response.
     */
    authResponse(responseData) {
        const admin = this.decode(responseData?.admin || {});
        if (responseData?.token && responseData?.admin) {
            this.client.authStore.save(responseData.token, admin);
        }
        return Object.assign({}, responseData, {
            // normalize common fields
            'token': responseData?.token || '',
            'admin': admin,
        });
    }
    authWithPassword(email, password, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'identity': email,
                'password': password,
            },
        };
        options = normalizeLegacyOptionsArgs('This form of authWithPassword(email, pass, body?, query?) is depreacted. Consider replacing it with authWithPassword(email, pass, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCrudPath + '/auth-with-password', options)
            .then(this.authResponse.bind(this));
    }
    authRefresh(bodyOrOptions, query) {
        let options = {
            'method': 'POST',
        };
        options = normalizeLegacyOptionsArgs('This form of authRefresh(body?, query?) is depreacted. Consider replacing it with authRefresh(options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCrudPath + '/auth-refresh', options)
            .then(this.authResponse.bind(this));
    }
    requestPasswordReset(email, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'email': email,
            },
        };
        options = normalizeLegacyOptionsArgs('This form of requestPasswordReset(email, body?, query?) is depreacted. Consider replacing it with requestPasswordReset(email, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCrudPath + '/request-password-reset', options)
            .then(() => true);
    }
    confirmPasswordReset(resetToken, password, passwordConfirm, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'token': resetToken,
                'password': password,
                'passwordConfirm': passwordConfirm,
            },
        };
        options = normalizeLegacyOptionsArgs('This form of confirmPasswordReset(resetToken, password, passwordConfirm, body?, query?) is depreacted. Consider replacing it with confirmPasswordReset(resetToken, password, passwordConfirm, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCrudPath + '/confirm-password-reset', options)
            .then(() => true);
    }
}

class RecordService extends CrudService {
    constructor(client, collectionIdOrName) {
        super(client);
        this.collectionIdOrName = collectionIdOrName;
    }
    /**
     * @inheritdoc
     */
    get baseCrudPath() {
        return this.baseCollectionPath + '/records';
    }
    /**
     * Returns the current collection service base path.
     */
    get baseCollectionPath() {
        return '/api/collections/' + encodeURIComponent(this.collectionIdOrName);
    }
    // ---------------------------------------------------------------
    // Realtime handlers
    // ---------------------------------------------------------------
    /**
     * @deprecated Use subscribe(recordId, callback) instead.
     *
     * Subscribe to the realtime changes of a single record in the collection.
     */
    async subscribeOne(recordId, callback) {
        console.warn("CoddySpace: subscribeOne(recordId, callback) is deprecated. Please replace it with subscribe(recordId, callback).");
        return this.client.realtime.subscribe(this.collectionIdOrName + "/" + recordId, callback);
    }
    async subscribe(topicOrCallback, callback) {
        if (typeof topicOrCallback === 'function') {
            console.warn("CoddySpace: subscribe(callback) is deprecated. Please replace it with subscribe('*', callback).");
            return this.client.realtime.subscribe(this.collectionIdOrName, topicOrCallback);
        }
        if (!callback) {
            throw new Error("Missing subscription callback.");
        }
        if (topicOrCallback === "") {
            throw new Error("Missing topic.");
        }
        let topic = this.collectionIdOrName;
        if (topicOrCallback !== "*") {
            topic += ('/' + topicOrCallback);
        }
        return this.client.realtime.subscribe(topic, callback);
    }
    /**
     * Unsubscribe from all subscriptions of the specified topic
     * ("*" or record id).
     *
     * If `topic` is not set, then this method will unsubscribe from
     * all subscriptions associated to the current collection.
     */
    async unsubscribe(topic) {
        // unsubscribe wildcard topic
        if (topic === "*") {
            return this.client.realtime.unsubscribe(this.collectionIdOrName);
        }
        // unsubscribe recordId topic
        if (topic) {
            return this.client.realtime.unsubscribe(this.collectionIdOrName + "/" + topic);
        }
        // unsubscribe from everything related to the collection
        return this.client.realtime.unsubscribeByPrefix(this.collectionIdOrName);
    }
    /**
     * @inheritdoc
     */
    getFullList(batchOrOptions, options) {
        if (typeof batchOrOptions == "number") {
            return super.getFullList(batchOrOptions, options);
        }
        const params = Object.assign({}, batchOrOptions, options);
        return super.getFullList(params);
    }
    /**
     * @inheritdoc
     */
    getList(page = 1, perPage = 30, options) {
        return super.getList(page, perPage, options);
    }
    /**
     * @inheritdoc
     */
    getFirstListItem(filter, options) {
        return super.getFirstListItem(filter, options);
    }
    /**
     * @inheritdoc
     */
    getOne(id, options) {
        return super.getOne(id, options);
    }
    /**
     * @inheritdoc
     */
    create(bodyParams, options) {
        return super.create(bodyParams, options);
    }
    /**
     * @inheritdoc
     *
     * If the current `client.authStore.model` matches with the updated id, then
     * on success the `client.authStore.model` will be updated with the result.
     */
    update(id, bodyParams, options) {
        return super.update(id, bodyParams, options).then((item) => {
            if (
            // is record auth
            this.client.authStore.model?.id === item?.id &&
                (this.client.authStore.model?.collectionId === this.collectionIdOrName ||
                    this.client.authStore.model?.collectionName === this.collectionIdOrName)) {
                this.client.authStore.save(this.client.authStore.token, item);
            }
            return item;
        });
    }
    /**
     * @inheritdoc
     *
     * If the current `client.authStore.model` matches with the deleted id,
     * then on success the `client.authStore` will be cleared.
     */
    delete(id, options) {
        return super.delete(id, options).then((success) => {
            if (success &&
                // is record auth
                this.client.authStore.model?.id === id &&
                (this.client.authStore.model?.collectionId === this.collectionIdOrName ||
                    this.client.authStore.model?.collectionName === this.collectionIdOrName)) {
                this.client.authStore.clear();
            }
            return success;
        });
    }
    // ---------------------------------------------------------------
    // Auth handlers
    // ---------------------------------------------------------------
    /**
     * Prepare successful collection authorization response.
     */
    authResponse(responseData) {
        const record = this.decode(responseData?.record || {});
        this.client.authStore.save(responseData?.token, record);
        return Object.assign({}, responseData, {
            // normalize common fields
            'token': responseData?.token || '',
            'record': record,
        });
    }
    /**
     * Returns all available collection auth methods.
     */
    listAuthMethods(options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send(this.baseCollectionPath + '/auth-methods', options)
            .then((responseData) => {
            return Object.assign({}, responseData, {
                // normalize common fields
                'usernamePassword': !!responseData?.usernamePassword,
                'emailPassword': !!responseData?.emailPassword,
                'authProviders': Array.isArray(responseData?.authProviders) ? responseData?.authProviders : [],
            });
        });
    }
    authWithPassword(usernameOrEmail, password, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'identity': usernameOrEmail,
                'password': password,
            },
        };
        options = normalizeLegacyOptionsArgs('This form of authWithPassword(usernameOrEmail, pass, body?, query?) is depreacted. Consider replacing it with authWithPassword(usernameOrEmail, pass, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/auth-with-password', options)
            .then((data) => this.authResponse(data));
    }
    authWithOAuth2Code(provider, code, codeVerifier, redirectUrl, createData, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'provider': provider,
                'code': code,
                'codeVerifier': codeVerifier,
                'redirectUrl': redirectUrl,
                'createData': createData,
            },
        };
        options = normalizeLegacyOptionsArgs('This form of authWithOAuth2Code(provider, code, codeVerifier, redirectUrl, createData?, body?, query?) is depreacted. Consider replacing it with authWithOAuth2Code(provider, code, codeVerifier, redirectUrl, createData?, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/auth-with-oauth2', options)
            .then((data) => this.authResponse(data));
    }
    async authWithOAuth2(...args) {
        // fallback to legacy format
        if (args.length > 1 || typeof args?.[0] === 'string') {
            console.warn("CoddySpace: This form of authWithOAuth2() is deprecated and may get removed in the future. Please replace with authWithOAuth2Code() OR use the authWithOAuth2() realtime form as shown in https://coddyspace.io/docs/authentication/#oauth2-integration.");
            return this.authWithOAuth2Code(args?.[0] || '', args?.[1] || '', args?.[2] || '', args?.[3] || '', args?.[4] || {}, args?.[5] || {}, args?.[6] || {});
        }
        const config = args?.[0] || {};
        const authMethods = await this.listAuthMethods();
        const provider = authMethods.authProviders.find((p) => p.name === config.provider);
        if (!provider) {
            throw new ClientResponseError(new Error(`Missing or invalid provider "${config.provider}".`));
        }
        const redirectUrl = this.client.buildUrl('/api/oauth2-redirect');
        return new Promise(async (resolve, reject) => {
            try {
                // initialize a one-off @oauth2 realtime subscription
                const unsubscribe = await this.client.realtime.subscribe('@oauth2', async (e) => {
                    const oldState = this.client.realtime.clientId;
                    try {
                        unsubscribe();
                        if (!e.state || oldState !== e.state) {
                            throw new Error("State parameters don't match.");
                        }
                        // clear the non SendOptions props
                        const options = Object.assign({}, config);
                        delete options.provider;
                        delete options.scopes;
                        delete options.createData;
                        delete options.urlCallback;
                        const authData = await this.authWithOAuth2Code(provider.name, e.code, provider.codeVerifier, redirectUrl, config.createData, options);
                        resolve(authData);
                    }
                    catch (err) {
                        reject(new ClientResponseError(err));
                    }
                });
                const replacements = {
                    "state": this.client.realtime.clientId,
                };
                if (config.scopes?.length) {
                    replacements["scope"] = config.scopes.join(" ");
                }
                const url = this._replaceQueryParams(provider.authUrl + redirectUrl, replacements);
                await (config.urlCallback ? config.urlCallback(url) : this._defaultUrlCallback(url));
            }
            catch (err) {
                reject(new ClientResponseError(err));
            }
        });
    }
    authRefresh(bodyOrOptions, query) {
        let options = {
            'method': 'POST',
        };
        options = normalizeLegacyOptionsArgs('This form of authRefresh(body?, query?) is depreacted. Consider replacing it with authRefresh(options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/auth-refresh', options)
            .then((data) => this.authResponse(data));
    }
    requestPasswordReset(email, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'email': email,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of requestPasswordReset(email, body?, query?) is depreacted. Consider replacing it with requestPasswordReset(email, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/request-password-reset', options).then(() => true);
    }
    confirmPasswordReset(passwordResetToken, password, passwordConfirm, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'token': passwordResetToken,
                'password': password,
                'passwordConfirm': passwordConfirm,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of confirmPasswordReset(token, password, passwordConfirm, body?, query?) is depreacted. Consider replacing it with confirmPasswordReset(token, password, passwordConfirm, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/confirm-password-reset', options)
            .then(() => true);
    }
    requestVerification(email, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'email': email,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of requestVerification(email, body?, query?) is depreacted. Consider replacing it with requestVerification(email, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/request-verification', options)
            .then(() => true);
    }
    confirmVerification(verificationToken, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'token': verificationToken,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of confirmVerification(token, body?, query?) is depreacted. Consider replacing it with confirmVerification(token, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/confirm-verification', options)
            .then(() => true);
    }
    requestEmailChange(newEmail, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'newEmail': newEmail,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of requestEmailChange(newEmail, body?, query?) is depreacted. Consider replacing it with requestEmailChange(newEmail, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/request-email-change', options)
            .then(() => true);
    }
    confirmEmailChange(emailChangeToken, password, bodyOrOptions, query) {
        let options = {
            'method': 'POST',
            'body': {
                'token': emailChangeToken,
                'password': password,
            }
        };
        options = normalizeLegacyOptionsArgs('This form of confirmEmailChange(token, password, body?, query?) is depreacted. Consider replacing it with confirmEmailChange(token, password, options?).', options, bodyOrOptions, query);
        return this.client.send(this.baseCollectionPath + '/confirm-email-change', options)
            .then(() => true);
    }
    /**
     * Lists all linked external auth providers for the specified auth record.
     */
    listExternalAuths(recordId, options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send(this.baseCrudPath + '/' + encodeURIComponent(recordId) + '/external-auths', options);
    }
    /**
     * Unlink a single external auth provider from the specified auth record.
     */
    unlinkExternalAuth(recordId, provider, options) {
        options = Object.assign({
            'method': 'DELETE',
        }, options);
        return this.client.send(this.baseCrudPath + '/' + encodeURIComponent(recordId) + '/external-auths/' + encodeURIComponent(provider), options)
            .then(() => true);
    }
    // ---------------------------------------------------------------
    // very rudimentary url query params replacement because at the moment
    // URL (and URLSearchParams) doesn't seem to be fully supported in React Native
    //
    // note: for details behind some of the decode/encode parsing check https://unixpapa.com/js/querystring.html
    _replaceQueryParams(url, replacements = {}) {
        let urlPath = url;
        let query = "";
        const queryIndex = url.indexOf("?");
        if (queryIndex >= 0) {
            urlPath = url.substring(0, url.indexOf("?"));
            query = url.substring(url.indexOf("?") + 1);
        }
        const parsedParams = {};
        // parse the query parameters
        const rawParams = query.split("&");
        for (const param of rawParams) {
            if (param == "") {
                continue;
            }
            const pair = param.split("=");
            parsedParams[decodeURIComponent(pair[0].replace(/\+/g, ' '))] = decodeURIComponent((pair[1] || "").replace(/\+/g, ' '));
        }
        // apply the replacements
        for (let key in replacements) {
            if (!replacements.hasOwnProperty(key)) {
                continue;
            }
            if (replacements[key] == null) {
                delete parsedParams[key];
            }
            else {
                parsedParams[key] = replacements[key];
            }
        }
        // construct back the full query string
        query = "";
        for (let key in parsedParams) {
            if (!parsedParams.hasOwnProperty(key)) {
                continue;
            }
            if (query != "") {
                query += "&";
            }
            query += encodeURIComponent(key.replace(/%20/g, '+')) + "=" + encodeURIComponent(parsedParams[key].replace(/%20/g, '+'));
        }
        return query != "" ? (urlPath + "?" + query) : urlPath;
    }
    _defaultUrlCallback(url) {
        if (typeof window === "undefined" || !window?.open) {
            throw new ClientResponseError(new Error(`Not in a browser context - please pass a custom urlCallback function.`));
        }
        let width = 1024;
        let height = 768;
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        // normalize window size
        width = width > windowWidth ? windowWidth : width;
        height = height > windowHeight ? windowHeight : height;
        let left = (windowWidth / 2) - (width / 2);
        let top = (windowHeight / 2) - (height / 2);
        window.open(url, "oauth2-popup", 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left + ',resizable,menubar=no');
    }
}

class CollectionService extends CrudService {
    /**
     * @inheritdoc
     */
    get baseCrudPath() {
        return '/api/collections';
    }
    /**
     * Imports the provided collections.
     *
     * If `deleteMissing` is `true`, all local collections and schema fields,
     * that are not present in the imported configuration, WILL BE DELETED
     * (including their related records data)!
     */
    async import(collections, deleteMissing = false, options) {
        options = Object.assign({
            'method': 'PUT',
            'body': {
                'collections': collections,
                'deleteMissing': deleteMissing,
            }
        }, options);
        return this.client.send(this.baseCrudPath + '/import', options)
            .then(() => true);
    }
}

class LogService extends BaseService {
    /**
     * Returns paginated logged requests list.
     */
    getRequestsList(page = 1, perPage = 30, options) {
        options = Object.assign({ 'method': 'GET' }, options);
        options.query = Object.assign({
            'page': page,
            'perPage': perPage,
        }, options.query);
        return this.client.send('/api/logs/requests', options);
    }
    /**
     * Returns a single logged request by its id.
     */
    getRequest(id, options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send('/api/logs/requests/' + encodeURIComponent(id), options);
    }
    /**
     * Returns request logs statistics.
     */
    getRequestsStats(options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send('/api/logs/requests/stats', options);
    }
}

class RealtimeService extends BaseService {
    constructor() {
        super(...arguments);
        this.clientId = "";
        this.eventSource = null;
        this.subscriptions = {};
        this.lastSentTopics = [];
        this.maxConnectTimeout = 15000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Infinity;
        this.predefinedReconnectIntervals = [
            200, 300, 500, 1000, 1200, 1500, 2000,
        ];
        this.pendingConnects = [];
    }
    /**
     * Returns whether the realtime connection has been established.
     */
    get isConnected() {
        return !!this.eventSource && !!this.clientId && !this.pendingConnects.length;
    }
    /**
     * Register the subscription listener.
     *
     * You can subscribe multiple times to the same topic.
     *
     * If the SSE connection is not started yet,
     * this method will also initialize it.
     */
    async subscribe(topic, callback) {
        if (!topic) {
            throw new Error('topic must be set.');
        }
        const listener = function (e) {
            const msgEvent = e;
            let data;
            try {
                data = JSON.parse(msgEvent?.data);
            }
            catch { }
            callback(data || {});
        };
        // store the listener
        if (!this.subscriptions[topic]) {
            this.subscriptions[topic] = [];
        }
        this.subscriptions[topic].push(listener);
        if (!this.isConnected) {
            // initialize sse connection
            await this.connect();
        }
        else if (this.subscriptions[topic].length === 1) {
            // send the updated subscriptions (if it is the first for the topic)
            await this.submitSubscriptions();
        }
        else {
            // only register the listener
            this.eventSource?.addEventListener(topic, listener);
        }
        return async () => {
            return this.unsubscribeByTopicAndListener(topic, listener);
        };
    }
    /**
     * Unsubscribe from all subscription listeners with the specified topic.
     *
     * If `topic` is not provided, then this method will unsubscribe
     * from all active subscriptions.
     *
     * This method is no-op if there are no active subscriptions.
     *
     * The related sse connection will be autoclosed if after the
     * unsubscribe operation there are no active subscriptions left.
     */
    async unsubscribe(topic) {
        if (!this.hasSubscriptionListeners(topic)) {
            return; // already unsubscribed
        }
        if (!topic) {
            // remove all subscriptions
            this.subscriptions = {};
        }
        else {
            // remove all topic listeners
            for (let listener of this.subscriptions[topic]) {
                this.eventSource?.removeEventListener(topic, listener);
            }
            delete this.subscriptions[topic];
        }
        if (!this.hasSubscriptionListeners()) {
            // no other active subscriptions -> close the sse connection
            this.disconnect();
        }
        else if (!this.hasSubscriptionListeners(topic)) {
            // submit subscriptions change if there are no other active subscriptions related to the topic
            await this.submitSubscriptions();
        }
    }
    /**
     * Unsubscribe from all subscription listeners starting with the specified topic prefix.
     *
     * This method is no-op if there are no active subscriptions with the specified topic prefix.
     *
     * The related sse connection will be autoclosed if after the
     * unsubscribe operation there are no active subscriptions left.
     */
    async unsubscribeByPrefix(topicPrefix) {
        let hasAtleastOneTopic = false;
        for (let topic in this.subscriptions) {
            if (!topic.startsWith(topicPrefix)) {
                continue;
            }
            hasAtleastOneTopic = true;
            for (let listener of this.subscriptions[topic]) {
                this.eventSource?.removeEventListener(topic, listener);
            }
            delete this.subscriptions[topic];
        }
        if (!hasAtleastOneTopic) {
            return; // nothing to unsubscribe from
        }
        if (this.hasSubscriptionListeners()) {
            // submit the deleted subscriptions
            await this.submitSubscriptions();
        }
        else {
            // no other active subscriptions -> close the sse connection
            this.disconnect();
        }
    }
    /**
     * Unsubscribe from all subscriptions matching the specified topic and listener function.
     *
     * This method is no-op if there are no active subscription with
     * the specified topic and listener.
     *
     * The related sse connection will be autoclosed if after the
     * unsubscribe operation there are no active subscriptions left.
     */
    async unsubscribeByTopicAndListener(topic, listener) {
        if (!Array.isArray(this.subscriptions[topic]) || !this.subscriptions[topic].length) {
            return; // already unsubscribed
        }
        let exist = false;
        for (let i = this.subscriptions[topic].length - 1; i >= 0; i--) {
            if (this.subscriptions[topic][i] !== listener) {
                continue;
            }
            exist = true; // has at least one matching listener
            delete this.subscriptions[topic][i]; // removes the function reference
            this.subscriptions[topic].splice(i, 1); // reindex the array
            this.eventSource?.removeEventListener(topic, listener);
        }
        if (!exist) {
            return;
        }
        // remove the topic from the subscriptions list if there are no other listeners
        if (!this.subscriptions[topic].length) {
            delete this.subscriptions[topic];
        }
        if (!this.hasSubscriptionListeners()) {
            // no other active subscriptions -> close the sse connection
            this.disconnect();
        }
        else if (!this.hasSubscriptionListeners(topic)) {
            // submit subscriptions change if there are no other active subscriptions related to the topic
            await this.submitSubscriptions();
        }
    }
    hasSubscriptionListeners(topicToCheck) {
        this.subscriptions = this.subscriptions || {};
        // check the specified topic
        if (topicToCheck) {
            return !!this.subscriptions[topicToCheck]?.length;
        }
        // check for at least one non-empty topic
        for (let topic in this.subscriptions) {
            if (!!this.subscriptions[topic]?.length) {
                return true;
            }
        }
        return false;
    }
    async submitSubscriptions() {
        if (!this.clientId) {
            return; // no client/subscriber
        }
        // optimistic update
        this.addAllSubscriptionListeners();
        this.lastSentTopics = this.getNonEmptySubscriptionTopics();
        return this.client.send('/api/realtime', {
            'method': 'POST',
            'body': {
                'clientId': this.clientId,
                'subscriptions': this.lastSentTopics,
            },
            'query': {
                'requestKey': this.getSubscriptionsCancelKey(),
            },
        }).catch((err) => {
            if (err?.isAbort) {
                return; // silently ignore aborted pending requests
            }
            throw err;
        });
    }
    getSubscriptionsCancelKey() {
        return "realtime_" + this.clientId;
    }
    getNonEmptySubscriptionTopics() {
        const result = [];
        for (let topic in this.subscriptions) {
            if (this.subscriptions[topic].length) {
                result.push(topic);
            }
        }
        return result;
    }
    addAllSubscriptionListeners() {
        if (!this.eventSource) {
            return;
        }
        this.removeAllSubscriptionListeners();
        for (let topic in this.subscriptions) {
            for (let listener of this.subscriptions[topic]) {
                this.eventSource.addEventListener(topic, listener);
            }
        }
    }
    removeAllSubscriptionListeners() {
        if (!this.eventSource) {
            return;
        }
        for (let topic in this.subscriptions) {
            for (let listener of this.subscriptions[topic]) {
                this.eventSource.removeEventListener(topic, listener);
            }
        }
    }
    async connect() {
        if (this.reconnectAttempts > 0) {
            // immediately resolve the promise to avoid indefinitely
            // blocking the client during reconnection
            return;
        }
        return new Promise((resolve, reject) => {
            this.pendingConnects.push({ resolve, reject });
            if (this.pendingConnects.length > 1) {
                // all promises will be resolved once the connection is established
                return;
            }
            this.initConnect();
        });
    }
    initConnect() {
        this.disconnect(true);
        // wait up to 15s for connect
        clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = setTimeout(() => {
            this.connectErrorHandler(new Error("EventSource connect took too long."));
        }, this.maxConnectTimeout);
        this.eventSource = new EventSource(this.client.buildUrl('/api/realtime'));
        this.eventSource.onerror = (_) => {
            this.connectErrorHandler(new Error("Failed to establish realtime connection."));
        };
        this.eventSource.addEventListener('PB_CONNECT', (e) => {
            const msgEvent = e;
            this.clientId = msgEvent?.lastEventId;
            this.submitSubscriptions()
                .then(async () => {
                let retries = 3;
                while (this.hasUnsentSubscriptions() && retries > 0) {
                    retries--;
                    // resubscribe to ensure that the latest topics are submitted
                    //
                    // This is needed because missed topics could happen on reconnect
                    // if after the pending sent `submitSubscriptions()` call another `subscribe()`
                    // was made before the submit was able to complete.
                    await this.submitSubscriptions();
                }
            }).then(() => {
                for (let p of this.pendingConnects) {
                    p.resolve();
                }
                // reset connect meta
                this.pendingConnects = [];
                this.reconnectAttempts = 0;
                clearTimeout(this.reconnectTimeoutId);
                clearTimeout(this.connectTimeoutId);
            }).catch((err) => {
                this.clientId = "";
                this.connectErrorHandler(err);
            });
        });
    }
    hasUnsentSubscriptions() {
        const latestTopics = this.getNonEmptySubscriptionTopics();
        if (latestTopics.length != this.lastSentTopics.length) {
            return true;
        }
        for (const t of latestTopics) {
            if (!this.lastSentTopics.includes(t)) {
                return true;
            }
        }
        return false;
    }
    connectErrorHandler(err) {
        clearTimeout(this.connectTimeoutId);
        clearTimeout(this.reconnectTimeoutId);
        if (
        // wasn't previously connected -> direct reject
        (!this.clientId && !this.reconnectAttempts) ||
            // was previously connected but the max reconnection limit has been reached
            this.reconnectAttempts > this.maxReconnectAttempts) {
            for (let p of this.pendingConnects) {
                p.reject(new ClientResponseError(err));
            }
            this.pendingConnects = [];
            this.disconnect();
            return;
        }
        // otherwise -> reconnect in the background
        this.disconnect(true);
        const timeout = this.predefinedReconnectIntervals[this.reconnectAttempts] || this.predefinedReconnectIntervals[this.predefinedReconnectIntervals.length - 1];
        this.reconnectAttempts++;
        this.reconnectTimeoutId = setTimeout(() => {
            this.initConnect();
        }, timeout);
    }
    disconnect(fromReconnect = false) {
        clearTimeout(this.connectTimeoutId);
        clearTimeout(this.reconnectTimeoutId);
        this.removeAllSubscriptionListeners();
        this.client.cancelRequest(this.getSubscriptionsCancelKey());
        this.eventSource?.close();
        this.eventSource = null;
        this.clientId = "";
        if (!fromReconnect) {
            this.reconnectAttempts = 0;
            // resolve any remaining connect promises
            //
            // this is done to avoid unnecessary throwing errors in case
            // unsubscribe is called before the pending connect promises complete
            for (let p of this.pendingConnects) {
                p.resolve();
            }
            this.pendingConnects = [];
        }
    }
}

class HealthService extends BaseService {
    /**
     * Checks the health status of the api.
     */
    check(options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send('/api/health', options);
    }
}

class FileService extends BaseService {
    /**
     * Builds and returns an absolute record file url for the provided filename.
     */
    getUrl(record, filename, queryParams = {}) {
        if (!filename || !record?.id) {
            return '';
        }
        const parts = [];
        parts.push('api');
        parts.push('files');
        parts.push(encodeURIComponent(record.collectionId || record.collectionName));
        parts.push(encodeURIComponent(record.id));
        parts.push(encodeURIComponent(filename));
        let result = this.client.buildUrl(parts.join('/'));
        if (Object.keys(queryParams).length) {
            // normalize the download query param for consistency with the Dart sdk
            if (queryParams.download === false) {
                delete (queryParams.download);
            }
            const params = new URLSearchParams(queryParams);
            result += (result.includes('?') ? '&' : '?') + params;
        }
        return result;
    }
    /**
     * Requests a new private file access token for the current auth model (admin or record).
     */
    getToken(options) {
        options = Object.assign({
            'method': 'POST',
        }, options);
        return this.client.send('/api/files/token', options)
            .then((data) => data?.token || '');
    }
}

class BackupService extends BaseService {
    /**
     * Returns list with all available backup files.
     */
    getFullList(options) {
        options = Object.assign({
            'method': 'GET',
        }, options);
        return this.client.send('/api/backups', options);
    }
    /**
     * Initializes a new backup.
     */
    create(basename, options) {
        options = Object.assign({
            'method': 'POST',
            'body': {
                'name': basename,
            },
        }, options);
        return this.client.send('/api/backups', options)
            .then(() => true);
    }
    /**
     * Deletes a single backup file.
     */
    delete(key, options) {
        options = Object.assign({
            'method': 'DELETE',
        }, options);
        return this.client.send(`/api/backups/${encodeURIComponent(key)}`, options)
            .then(() => true);
    }
    /**
     * Initializes an app data restore from an existing backup.
     */
    restore(key, options) {
        options = Object.assign({
            'method': 'POST',
        }, options);
        return this.client.send(`/api/backups/${encodeURIComponent(key)}/restore`, options)
            .then(() => true);
    }
    /**
     * Builds a download url for a single existing backup using an
     * admin file token and the backup file key.
     *
     * The file token can be generated via `pb.files.getToken()`.
     */
    getDownloadUrl(token, key) {
        return this.client.buildUrl(`/api/backups/${encodeURIComponent(key)}?token=${encodeURIComponent(token)}`);
    }
}

// list of known SendOptions keys (everything else is treated as query param)
const knownSendOptionsKeys = [
    'requestKey',
    '$cancelKey',
    '$autoCancel',
    'fetch',
    'headers',
    'body',
    'query',
    'params',
    // ---,
    'cache',
    'credentials',
    'headers',
    'integrity',
    'keepalive',
    'method',
    'mode',
    'redirect',
    'referrer',
    'referrerPolicy',
    'signal',
    'window',
];
/**
 * PocketBase JS Client.
 */
class Client {
    constructor(baseUrl = '/', authStore, lang = 'en-US') {
        this.cancelControllers = {};
        this.recordServices = {};
        this.enableAutoCancellation = true;
        this.baseUrl = baseUrl;
        this.lang = lang;
        this.authStore = authStore || new LocalAuthStore();
        // services
        this.admins = new AdminService(this);
        this.collections = new CollectionService(this);
        this.files = new FileService(this);
        this.logs = new LogService(this);
        this.settings = new SettingsService(this);
        this.realtime = new RealtimeService(this);
        this.health = new HealthService(this);
        this.backups = new BackupService(this);
    }
    /**
     * Returns the RecordService associated to the specified collection.
     *
     * @param  {string} idOrName
     * @return {RecordService}
     */
    collection(idOrName) {
        if (!this.recordServices[idOrName]) {
            this.recordServices[idOrName] = new RecordService(this, idOrName);
        }
        return this.recordServices[idOrName];
    }
    /**
     * Globally enable or disable auto cancellation for pending duplicated requests.
     */
    autoCancellation(enable) {
        this.enableAutoCancellation = !!enable;
        return this;
    }
    /**
     * Cancels single request by its cancellation key.
     */
    cancelRequest(requestKey) {
        if (this.cancelControllers[requestKey]) {
            this.cancelControllers[requestKey].abort();
            delete this.cancelControllers[requestKey];
        }
        return this;
    }
    /**
     * Cancels all pending requests.
     */
    cancelAllRequests() {
        for (let k in this.cancelControllers) {
            this.cancelControllers[k].abort();
        }
        this.cancelControllers = {};
        return this;
    }
    /**
     * Legacy alias of `pb.files.getUrl()`.
     */
    getFileUrl(record, filename, queryParams = {}) {
        return this.files.getUrl(record, filename, queryParams);
    }
    /**
     * Builds a full client url by safely concatenating the provided path.
     */
    buildUrl(path) {
        let url = this.baseUrl;
        // construct an absolute base url if in a browser environment
        if (typeof window !== 'undefined' &&
            !!window.location &&
            !url.startsWith('https://') &&
            !url.startsWith('http://')) {
            url = window.location.origin?.endsWith('/') ?
                window.location.origin.substring(0, window.location.origin.length - 1) :
                (window.location.origin || '');
            if (!this.baseUrl.startsWith('/')) {
                url += window.location.pathname || '/';
                url += url.endsWith('/') ? '' : '/';
            }
            url += this.baseUrl;
        }
        // concatenate the path
        if (path) {
            url += url.endsWith('/') ? '' : '/'; // append trailing slash if missing
            url += path.startsWith('/') ? path.substring(1) : path;
        }
        return url;
    }
    /**
     * Sends an api http request.
     */
    async send(path, options) {
        options = this.initSendOptions(path, options);
        // build url + path
        let url = this.buildUrl(path);
        // serialize the query parameters
        if (typeof options.query !== 'undefined') {
            const query = this.serializeQueryParams(options.query);
            if (query) {
                url += (url.includes('?') ? '&' : '?') + query;
            }
            delete options.query;
        }
        if (this.beforeSend) {
            const result = Object.assign({}, await this.beforeSend(url, options));
            if (typeof result.url !== 'undefined' || typeof result.options !== 'undefined') {
                url = result.url || url;
                options = result.options || options;
            }
            else if (Object.keys(result).length) {
                // legacy behavior
                options = result;
                console?.warn && console.warn('Deprecated format of beforeSend return: please use `return { url, options }`, instead of `return options`.');
            }
        }
        // ensures that the json body is serialized
        if (this.getHeader(options.headers, 'Content-Type') == 'application/json' &&
            options.body && typeof options.body !== 'string') {
            options.body = JSON.stringify(options.body);
        }
        const fetchFunc = options.fetch || fetch;
        // send the request
        return fetchFunc(url, options)
            .then(async (response) => {
            let data = {};
            try {
                data = await response.json();
            }
            catch (_) {
                // all api responses are expected to return json
                // with the exception of the realtime event and 204
            }
            if (this.afterSend) {
                data = await this.afterSend(response, data);
            }
            if (response.status >= 400) {
                throw new ClientResponseError({
                    url: response.url,
                    status: response.status,
                    data: data,
                });
            }
            return data;
        }).catch((err) => {
            // wrap to normalize all errors
            throw new ClientResponseError(err);
        });
    }
    /**
     * Shallow copy the provided object and takes care to initialize
     * any options required to preserve the backward compatability.
     *
     * @param  {SendOptions} options
     * @return {SendOptions}
     */
    initSendOptions(path, options) {
        options = Object.assign({ method: 'GET' }, options);
        options.query = options.query || {};
        // auto convert the body to FormData, if needed
        options.body = this.convertToFormDataIfNeeded(options.body);
        // move unknown send options as query parameters
        for (let key in options) {
            if (knownSendOptionsKeys.includes(key)) {
                continue;
            }
            options.query[key] = options[key];
            delete (options[key]);
        }
        // requestKey normalizations for backward-compatibility
        // ---
        options.query = Object.assign({}, options.params, options.query);
        if (typeof options.requestKey === 'undefined') {
            if (options.$autoCancel === false || options.query.$autoCancel === false) {
                options.requestKey = null;
            }
            else if (options.$cancelKey || options.query.$cancelKey) {
                options.requestKey = options.$cancelKey || options.query.$cancelKey;
            }
        }
        // remove the deprecated special cancellation params from the other query params
        delete options.$autoCancel;
        delete options.query.$autoCancel;
        delete options.$cancelKey;
        delete options.query.$cancelKey;
        // ---
        // add the json header, if not explicitly set
        // (for FormData body the Content-Type header should be skipped since the boundary is autogenerated)
        if (this.getHeader(options.headers, 'Content-Type') === null &&
            !this.isFormData(options.body)) {
            options.headers = Object.assign({}, options.headers, {
                'Content-Type': 'application/json',
            });
        }
        // add Accept-Language header, if not explicitly set
        if (this.getHeader(options.headers, 'Accept-Language') === null) {
            options.headers = Object.assign({}, options.headers, {
                'Accept-Language': this.lang,
            });
        }
        // check if Authorization header can be added
        if (
        // has valid token
        this.authStore.token &&
            // auth header is not explicitly set
            (this.getHeader(options.headers, 'Authorization') === null)) {
            options.headers = Object.assign({}, options.headers, {
                'Authorization': this.authStore.token,
            });
        }
        // handle auto cancelation for duplicated pending request
        if (this.enableAutoCancellation && options.requestKey !== null) {
            const requestKey = options.requestKey || ((options.method || 'GET') + path);
            // cancel previous pending requests
            this.cancelRequest(requestKey);
            const controller = new AbortController();
            this.cancelControllers[requestKey] = controller;
            options.signal = controller.signal;
        }
        return options;
    }
    /**
     * Converts analyzes the provided body and converts it to FormData
     * in case a plain object with File/Blob values is used.
     */
    convertToFormDataIfNeeded(body) {
        if (typeof FormData === 'undefined' ||
            typeof body === "undefined" ||
            typeof body !== "object" ||
            body === null ||
            this.isFormData(body) ||
            !this.hasBlobField(body)) {
            return body;
        }
        const form = new FormData();
        for (let key in body) {
            form.append(key, body[key]);
        }
        return form;
    }
    /**
     * Checks if the submitted body object has at least one Blob/File field.
     */
    hasBlobField(body) {
        for (let key in body) {
            const values = Array.isArray(body[key]) ? body[key] : [body[key]];
            for (let v of values) {
                if ((typeof Blob !== 'undefined' && v instanceof Blob) ||
                    (typeof File !== 'undefined' && v instanceof File)) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Extracts the header with the provided name in case-insensitive manner.
     * Returns `null` if no header matching the name is found.
     */
    getHeader(headers, name) {
        headers = headers || {};
        name = name.toLowerCase();
        for (let key in headers) {
            if (key.toLowerCase() == name) {
                return headers[key];
            }
        }
        return null;
    }
    /**
     * Loosely checks if the specified body is a FormData instance.
     */
    isFormData(body) {
        return body && (
        // we are checking the constructor name because FormData
        // is not available natively in some environments and the
        // polyfill(s) may not be globally accessible
        body.constructor.name === 'FormData' ||
            // fallback to global FormData instance check
            // note: this is needed because the constructor.name could be different in case of
            //       custom global FormData implementation, eg. React Native on Android/iOS
            (typeof FormData !== 'undefined' && body instanceof FormData));
    }
    /**
     * Serializes the provided query parameters into a query string.
     */
    serializeQueryParams(params) {
        const result = [];
        for (const key in params) {
            if (params[key] === null) {
                // skip null query params
                continue;
            }
            const value = params[key];
            const encodedKey = encodeURIComponent(key);
            if (Array.isArray(value)) {
                // repeat array params
                for (const v of value) {
                    result.push(encodedKey + '=' + encodeURIComponent(v));
                }
            }
            else if (value instanceof Date) {
                result.push(encodedKey + '=' + encodeURIComponent(value.toISOString()));
            }
            else if (typeof value !== null && typeof value === 'object') {
                result.push(encodedKey + '=' + encodeURIComponent(JSON.stringify(value)));
            }
            else {
                result.push(encodedKey + '=' + encodeURIComponent(value));
            }
        }
        return result.join('&');
    }
}

module.exports = Client;
