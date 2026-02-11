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

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var baseUrl = "https://zonatmo.com";
var fetchText = function (url) { return __awaiter(void 0, void 0, void 0, function () {
    var response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetch(url)];
            case 1:
                response = _a.sent();
                if (!response.ok) {
                    throw new Error("TuMangaOnline request failed");
                }
                return [2 /*return*/, response.text()];
        }
    });
}); };
var decodeHtml = function (value) {
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
};
var stripTags = function (value) { return decodeHtml(value.replace(/<[^>]+>/g, " ").trim()); };
var mapLibraryItems = function (html) {
    var items = [];
    var cardRegex = /<a[^>]+href="([^"]+\/library\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    var match;
    while ((match = cardRegex.exec(html))) {
        var href = match[1];
        var block = match[2];
        var idMatch = href.match(/\/library\/[^/]+\/(\d+)/);
        if (!idMatch) {
            continue;
        }
        var titleMatch = block.match(/title="([^"]+)"/);
        var altMatch = block.match(/alt="([^"]+)"/);
        var imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
        var title = decodeHtml((titleMatch === null || titleMatch === void 0 ? void 0 : titleMatch[1]) || (altMatch === null || altMatch === void 0 ? void 0 : altMatch[1]) || "Unknown");
        var coverUrl = imgMatch === null || imgMatch === void 0 ? void 0 : imgMatch[1];
        items.push({ id: idMatch[1], title: title, coverUrl: coverUrl });
    }
    return items;
};
var mapMangaDetails = function (html, providerMangaId) {
    var titleMatch = html.match(/<h1[^>]*class="[^"]*manga-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
    var altTitleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    var descriptionMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    var coverMatch = html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/);
    var title = stripTags((titleMatch === null || titleMatch === void 0 ? void 0 : titleMatch[1]) || (altTitleMatch === null || altTitleMatch === void 0 ? void 0 : altTitleMatch[1]) || "Unknown");
    var description = descriptionMatch ? stripTags(descriptionMatch[1]) : "";
    var coverUrl = coverMatch === null || coverMatch === void 0 ? void 0 : coverMatch[1];
    return {
        id: providerMangaId,
        title: title,
        subtitle: "TuMangaOnline",
        description: description,
        coverUrl: coverUrl,
    };
};
var mapChapterList = function (html) {
    var chapters = [];
    var chapterRegex = /href="([^"]+\/view_uploads\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    var match;
    while ((match = chapterRegex.exec(html))) {
        var id = match[2];
        var label = stripTags(match[3]);
        var numberMatch = label.match(/(?:Cap\.?|Chapter)\s*([0-9]+(?:\.[0-9]+)?)/i);
        chapters.push({
            id: id,
            title: label || "Chapter ".concat(id),
            chapterNumber: numberMatch ? Number(numberMatch[1]) : undefined,
        });
    }
    return chapters;
};
var provider = {
    meta: {
        id: "tumangaonline",
        name: "TuMangaOnline",
        version: "0.1.0",
        baseUrl: baseUrl,
        supportedLanguages: ["es"],
        supportsAuth: false,
        icon: "https://zonatmo.com/favicon/favicon-32x32.png",
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
            var html, genreRegex, genres, match, _loop_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetchText("".concat(baseUrl, "/library?genres=1"))];
                    case 1:
                        html = _a.sent();
                        genreRegex = /<a[^>]+href="[^"]*genre[^"]*"[^>]*>([^<]+)<\/a>/g;
                        genres = [];
                        _loop_1 = function () {
                            var title = stripTags(match[1]);
                            var id = title.toLowerCase().replace(/\s+/g, "-");
                            if (!genres.some(function (item) { return item.id === id; })) {
                                genres.push({ id: id, title: title });
                            }
                        };
                        while ((match = genreRegex.exec(html))) {
                            _loop_1();
                        }
                        return [2 /*return*/, genres.map(function (genre) { return ({
                                id: genre.id,
                                title: genre.title,
                                subtitle: "Genre",
                            }); })];
                }
            });
        });
    },
    getDiscoverSectionItems: function (sectionId, page) {
        return __awaiter(this, void 0, void 0, function () {
            var pageParam, path, html, items;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pageParam = page > 1 ? "?page=".concat(page) : "";
                        path = sectionId === "recent" ? "/library" : "/library";
                        return [4 /*yield*/, fetchText("".concat(baseUrl).concat(path).concat(pageParam))];
                    case 1:
                        html = _a.sent();
                        items = mapLibraryItems(html);
                        return [2 /*return*/, items.map(function (item) { return ({
                                id: item.id,
                                title: item.title,
                                subtitle: "TuMangaOnline",
                                description: "",
                                coverUrl: item.coverUrl,
                            }); })];
                }
            });
        });
    },
    search: function (query, page) {
        return __awaiter(this, void 0, void 0, function () {
            var pageParam, html, items;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pageParam = page > 1 ? "&page=".concat(page) : "";
                        return [4 /*yield*/, fetchText("".concat(baseUrl, "/library?title=").concat(encodeURIComponent(query)).concat(pageParam))];
                    case 1:
                        html = _a.sent();
                        items = mapLibraryItems(html);
                        return [2 /*return*/, items.map(function (item) { return ({
                                id: item.id,
                                title: item.title,
                                subtitle: "TuMangaOnline",
                                description: "",
                                coverUrl: item.coverUrl,
                            }); })];
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
            var html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetchText("".concat(baseUrl, "/library/manga/").concat(providerMangaId))];
                    case 1:
                        html = _a.sent();
                        return [2 /*return*/, mapMangaDetails(html, providerMangaId)];
                }
            });
        });
    },
    getChapterList: function (providerMangaId) {
        return __awaiter(this, void 0, void 0, function () {
            var html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetchText("".concat(baseUrl, "/library/manga/").concat(providerMangaId))];
                    case 1:
                        html = _a.sent();
                        return [2 /*return*/, mapChapterList(html)];
                }
            });
        });
    },
    getChapterPages: function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, []];
            });
        });
    },
};

module.exports = provider;
