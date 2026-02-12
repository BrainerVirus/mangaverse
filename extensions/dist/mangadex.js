'use strict';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var baseUrl = "https://api.mangadex.org";
var siteUrl = "https://mangadex.org";
var fetchJson = function (url) { return __awaiter(void 0, void 0, void 0, function () {
    var response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetch(url)];
            case 1:
                response = _a.sent();
                if (!response.ok) {
                    throw new Error("MangaDex request failed");
                }
                return [2 /*return*/, response.json()];
        }
    });
}); };
var buildUrl = function (path, params) {
    if (params === void 0) { params = []; }
    var query = params.filter(Boolean).join("&");
    return "".concat(baseUrl).concat(path).concat(query ? "?".concat(query) : "");
};
var toArrayParam = function (values) {
    return values.map(function (value) { return "includes[]=".concat(encodeURIComponent(value)); }).join("&");
};
var mapCoverUrl = function (mangaId, fileName) {
    if (!fileName) {
        return undefined;
    }
    return "https://uploads.mangadex.org/covers/".concat(mangaId, "/").concat(fileName, ".256.jpg");
};
var provider = {
    meta: {
        id: "mangadex",
        name: "MangaDex",
        version: "0.1.0",
        baseUrl: siteUrl,
        supportedLanguages: ["en"],
        supportsAuth: false,
        icon: "https://mangadex.org/favicon.ico",
    },
    getDiscoverSections: function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, [
                        { id: "popular", title: "Popular", items: [] },
                        { id: "latest", title: "Latest Updates", items: [] },
                        { id: "recent", title: "Recently Added", items: [] },
                    ]];
            });
        });
    },
    getDiscoverGenres: function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = buildUrl("/manga/tag", ["limit=100"]);
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_a.sent());
                        return [2 /*return*/, data.data.map(function (tag) {
                                var _a, _b;
                                var name = (_b = (_a = tag.attributes.name.en) !== null && _a !== void 0 ? _a : Object.values(tag.attributes.name)[0]) !== null && _b !== void 0 ? _b : "Genre";
                                return {
                                    id: tag.id,
                                    title: name,
                                    subtitle: "Genre",
                                };
                            })];
                }
            });
        });
    },
    getDiscoverSectionItems: function (sectionId, page, filters) {
        return __awaiter(this, void 0, void 0, function () {
            var limit, offset, baseParams, genreId, order, url, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        limit = 12;
                        offset = Math.max(0, page - 1) * limit;
                        baseParams = [
                            "availableTranslatedLanguage[]=en",
                            "limit=".concat(limit),
                            "offset=".concat(offset),
                            toArrayParam(["cover_art"]),
                        ];
                        genreId = typeof (filters === null || filters === void 0 ? void 0 : filters.genreId) === "string" ? filters.genreId : undefined;
                        if (sectionId === "genres" && genreId) {
                            baseParams.unshift("includedTags[]=".concat(encodeURIComponent(genreId)));
                        }
                        order = sectionId === "latest"
                            ? "order[latestUploadedChapter]=desc"
                            : sectionId === "recent"
                                ? "order[createdAt]=desc"
                                : "order[followedCount]=desc";
                        url = buildUrl("/manga", __spreadArray([order], baseParams, true));
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_a.sent());
                        return [2 /*return*/, data.data.map(function (item) {
                                var _a, _b, _c, _d, _e, _f, _g, _h;
                                var title = (_b = (_a = item.attributes.title.en) !== null && _a !== void 0 ? _a : Object.values(item.attributes.title)[0]) !== null && _b !== void 0 ? _b : "Untitled";
                                var description = (_d = (_c = item.attributes.description) === null || _c === void 0 ? void 0 : _c.en) !== null && _d !== void 0 ? _d : "";
                                var cover = (_f = (_e = item.relationships.find(function (rel) { return rel.type === "cover_art"; })) === null || _e === void 0 ? void 0 : _e.attributes) === null || _f === void 0 ? void 0 : _f.fileName;
                                var lastChapter = (_g = item.attributes.lastChapter) === null || _g === void 0 ? void 0 : _g.trim();
                                var chapterLabel = lastChapter ? "Chapter ".concat(lastChapter) : undefined;
                                var tags = (_h = item.attributes.tags) === null || _h === void 0 ? void 0 : _h.map(function (tag) { var _a, _b, _c, _d, _e; return (_c = (_b = (_a = tag.attributes) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.en) !== null && _c !== void 0 ? _c : Object.values((_e = (_d = tag.attributes) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : {})[0]; }).filter(function (tag) { return Boolean(tag); });
                                var subtitle = sectionId === "latest"
                                    ? "Latest"
                                    : sectionId === "recent"
                                        ? "Recent"
                                        : "Popular";
                                return {
                                    id: item.id,
                                    title: title,
                                    subtitle: chapterLabel !== null && chapterLabel !== void 0 ? chapterLabel : subtitle,
                                    description: description,
                                    coverUrl: mapCoverUrl(item.id, cover),
                                    tags: tags,
                                    lastChapter: lastChapter,
                                    language: "en",
                                };
                            })];
                }
            });
        });
    },
    search: function (query, page) {
        return __awaiter(this, void 0, void 0, function () {
            var limit, offset, url, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        limit = 12;
                        offset = Math.max(0, page - 1) * limit;
                        url = buildUrl("/manga", [
                            "title=".concat(encodeURIComponent(query)),
                            "availableTranslatedLanguage[]=en",
                            "limit=".concat(limit),
                            "offset=".concat(offset),
                            toArrayParam(["cover_art"]),
                        ]);
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_a.sent());
                        return [2 /*return*/, data.data.map(function (item) {
                                var _a, _b, _c, _d, _e, _f;
                                var title = (_b = (_a = item.attributes.title.en) !== null && _a !== void 0 ? _a : Object.values(item.attributes.title)[0]) !== null && _b !== void 0 ? _b : "Untitled";
                                var description = (_d = (_c = item.attributes.description) === null || _c === void 0 ? void 0 : _c.en) !== null && _d !== void 0 ? _d : "";
                                var cover = (_f = (_e = item.relationships.find(function (rel) { return rel.type === "cover_art"; })) === null || _e === void 0 ? void 0 : _e.attributes) === null || _f === void 0 ? void 0 : _f.fileName;
                                return {
                                    id: item.id,
                                    title: title,
                                    subtitle: "MangaDex",
                                    description: description,
                                    coverUrl: mapCoverUrl(item.id, cover),
                                };
                            })];
                }
            });
        });
    },
    getAvailableFilters: function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, []];
            });
        });
    },
    getMangaDetails: function (providerMangaId) {
        return __awaiter(this, void 0, void 0, function () {
            var url, data, title, description, cover;
            var _a, _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        url = buildUrl("/manga/".concat(providerMangaId), [toArrayParam(["cover_art", "author", "artist"])]);
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_g.sent());
                        title = (_b = (_a = data.data.attributes.title.en) !== null && _a !== void 0 ? _a : Object.values(data.data.attributes.title)[0]) !== null && _b !== void 0 ? _b : "Untitled";
                        description = (_d = (_c = data.data.attributes.description) === null || _c === void 0 ? void 0 : _c.en) !== null && _d !== void 0 ? _d : "";
                        cover = (_f = (_e = data.data.relationships.find(function (rel) { return rel.type === "cover_art"; })) === null || _e === void 0 ? void 0 : _e.attributes) === null || _f === void 0 ? void 0 : _f.fileName;
                        return [2 /*return*/, {
                                id: data.data.id,
                                title: title,
                                subtitle: "MangaDex",
                                description: description,
                                coverUrl: mapCoverUrl(data.data.id, cover),
                            }];
                }
            });
        });
    },
    getChapterList: function (providerMangaId_1) {
        return __awaiter(this, arguments, void 0, function (providerMangaId, languages) {
            var params, url, data;
            if (languages === void 0) { languages = ["en"]; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = __spreadArray([
                            "manga=".concat(encodeURIComponent(providerMangaId)),
                            "order[chapter]=asc",
                            "limit=100"
                        ], languages.map(function (lang) { return "translatedLanguage[]=".concat(encodeURIComponent(lang)); }), true);
                        url = buildUrl("/chapter", params);
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_a.sent());
                        return [2 /*return*/, data.data.map(function (chapter) {
                                var _a;
                                return ({
                                    id: chapter.id,
                                    title: chapter.attributes.title || "Chapter ".concat((_a = chapter.attributes.chapter) !== null && _a !== void 0 ? _a : "?"),
                                    chapterNumber: chapter.attributes.chapter ? Number(chapter.attributes.chapter) : undefined,
                                    volumeNumber: chapter.attributes.volume ? Number(chapter.attributes.volume) : undefined,
                                    language: chapter.attributes.translatedLanguage,
                                    publishedAt: chapter.attributes.publishAt
                                        ? new Date(chapter.attributes.publishAt).getTime()
                                        : undefined,
                                });
                            })];
                }
            });
        });
    },
    getChapterPages: function (providerChapterId) {
        return __awaiter(this, void 0, void 0, function () {
            var url, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = buildUrl("/at-home/server/".concat(providerChapterId));
                        return [4 /*yield*/, fetchJson(url)];
                    case 1:
                        data = (_a.sent());
                        return [2 /*return*/, data.chapter.data.map(function (fileName) { return ({
                                url: "".concat(data.baseUrl, "/data/").concat(data.chapter.hash, "/").concat(fileName),
                            }); })];
                }
            });
        });
    },
};

module.exports = provider;
