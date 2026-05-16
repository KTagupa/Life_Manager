(function (global) {
    'use strict';

    const ALLOWED_LINK_TYPES = new Set(['task', 'habit', 'goal', 'project']);
    const TAG_PATTERN = /#[a-zA-Z0-9_-]+/g;
    const DEFAULT_CATEGORY_COUNT = 10;

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function makeBlockId(offset) {
        return Date.now() + Math.random() + (offset || 0);
    }

    function createEmptyBlock(text = '') {
        return {
            id: makeBlockId(0),
            text: String(text || ''),
            colorIndex: 0,
            isEditing: true,
            bookmarkName: ''
        };
    }

    function normalizeBlock(raw, index = 0) {
        const block = isObject(raw) ? { ...raw } : {};
        if (block.id === undefined || block.id === null || block.id === '') block.id = makeBlockId(index);
        if (typeof block.text !== 'string') block.text = '';

        const colorIndex = Number(block.colorIndex);
        block.colorIndex = Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < DEFAULT_CATEGORY_COUNT
            ? colorIndex
            : 0;

        if (typeof block.isEditing !== 'boolean') block.isEditing = true;
        if (typeof block.bookmarkName !== 'string') block.bookmarkName = '';
        return block;
    }

    function resolveBodyInput(bodyOrNote) {
        if (isObject(bodyOrNote) && typeof bodyOrNote.body === 'string') return bodyOrNote.body;
        return typeof bodyOrNote === 'string' ? bodyOrNote : '';
    }

    function parseBlocks(bodyOrNote, options = {}) {
        const body = resolveBodyInput(bodyOrNote);
        const ensureOne = options.ensureOne !== false;
        if (!body) return ensureOne ? [createEmptyBlock('')] : [];

        try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed)) {
                const blocks = parsed.map((block, index) => normalizeBlock(block, index));
                return blocks.length || !ensureOne ? blocks : [createEmptyBlock('')];
            }
        } catch (error) {
            // Legacy plain text body.
        }

        return [createEmptyBlock(body)];
    }

    function serializeBlocks(blocks) {
        const normalizedBlocks = (Array.isArray(blocks) ? blocks : [])
            .map((block, index) => {
                const normalized = normalizeBlock(block, index);
                return {
                    ...block,
                    id: normalized.id,
                    text: normalized.text,
                    colorIndex: normalized.colorIndex,
                    isEditing: normalized.isEditing,
                    bookmarkName: normalized.bookmarkName
                };
            });
        return JSON.stringify(normalizedBlocks.length ? normalizedBlocks : [createEmptyBlock('')]);
    }

    function normalizeTaskIds(value) {
        const rawTaskIds = Array.isArray(value)
            ? value
            : (isObject(value) && Array.isArray(value.taskIds) ? value.taskIds : (isObject(value) && value.taskId ? [value.taskId] : []));
        return Array.from(new Set(rawTaskIds.map(id => String(id || '').trim()).filter(Boolean)));
    }

    function normalizeLink(rawLink, fallbackCreatedAt) {
        if (!isObject(rawLink)) return null;
        const type = String(rawLink.type || '').trim().toLowerCase();
        const id = String(rawLink.id || '').trim();
        if (!ALLOWED_LINK_TYPES.has(type) || !id) return null;
        const createdAt = Number(rawLink.createdAt) || Number(fallbackCreatedAt) || Date.now();
        return { type, id, createdAt };
    }

    function normalizeLinks(noteOrLinks) {
        const note = isObject(noteOrLinks) ? noteOrLinks : {};
        const rawLinks = Array.isArray(noteOrLinks) ? noteOrLinks : (Array.isArray(note.links) ? note.links : []);
        const fallbackCreatedAt = Number(note.createdAt) || Number(note.timestamp) || Date.now();
        const byKey = new Map();

        rawLinks.forEach((rawLink) => {
            const link = normalizeLink(rawLink, fallbackCreatedAt);
            if (!link) return;
            byKey.set(`${link.type}:${link.id}`, link);
        });

        normalizeTaskIds(note).forEach((taskId) => {
            const key = `task:${taskId}`;
            if (!byKey.has(key)) byKey.set(key, { type: 'task', id: taskId, createdAt: fallbackCreatedAt });
        });

        return Array.from(byKey.values());
    }

    function syncTaskIdsFromLinks(note) {
        if (!isObject(note)) return [];
        const links = normalizeLinks(note);
        const linkedTaskIds = links.filter(link => link.type === 'task').map(link => link.id);
        return Array.from(new Set([...normalizeTaskIds(note), ...linkedTaskIds]));
    }

    function addEntityLink(note, link) {
        if (!isObject(note)) return note;
        const normalized = normalizeLink(link, Date.now());
        if (!normalized) return note;
        const links = normalizeLinks(note);
        if (!links.some(item => item.type === normalized.type && item.id === normalized.id)) {
            links.push(normalized);
        }
        note.links = links;
        if (normalized.type === 'task') note.taskIds = syncTaskIdsFromLinks(note);
        return note;
    }

    function removeEntityLink(note, link) {
        if (!isObject(note) || !isObject(link)) return note;
        const type = String(link.type || '').trim().toLowerCase();
        const id = String(link.id || '').trim();
        if (!type || !id) return note;
        note.links = normalizeLinks(note).filter(item => !(item.type === type && item.id === id));
        if (type === 'task') note.taskIds = normalizeTaskIds(note.taskIds).filter(taskId => taskId !== id);
        return note;
    }

    function noteLinksTo(note, link) {
        if (!isObject(link)) return false;
        const type = String(link.type || '').trim().toLowerCase();
        const id = String(link.id || '').trim();
        if (!type || !id) return false;
        return normalizeLinks(note).some(item => item.type === type && item.id === id);
    }

    function getPlainText(note) {
        return parseBlocks(note, { ensureOne: false })
            .map(block => block.text || '')
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function extractTags(note) {
        const matches = getPlainText(note).match(TAG_PATTERN) || [];
        return Array.from(new Set(matches.map(tag => tag.toLowerCase())));
    }

    function extractBookmarks(noteOrBlocks) {
        const blocks = Array.isArray(noteOrBlocks) ? noteOrBlocks : parseBlocks(noteOrBlocks, { ensureOne: false });
        return blocks
            .filter(block => typeof block.bookmarkName === 'string' && block.bookmarkName.trim())
            .map(block => ({ id: String(block.id), name: block.bookmarkName.trim() }));
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replaceAll('`', '&#96;');
    }

    function isSafeUrl(value) {
        const url = String(value || '').trim();
        if (!url) return false;
        if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
        return /^(https?:|mailto:|tel:|data:image\/|blob:)/i.test(url);
    }

    function annotateWikiLinks(source, context = {}) {
        return String(source || '').replace(/\[\[(.*?)\]\]/g, (match, rawTitle) => {
            const title = String(rawTitle || '').trim();
            if (!title) return match;

            if (title.startsWith('#')) {
                const name = title.slice(1).trim();
                return `<a href="#" class="bookmark-link" data-note-action="bookmark" data-bookmark-name="${escapeAttr(name)}">#${escapeHtml(name)}</a>`;
            }

            const cleanTitle = title.replace(/^Note: /i, '').trim();
            const resolved = typeof context.resolveWikiLink === 'function'
                ? context.resolveWikiLink(cleanTitle)
                : null;
            const targetType = resolved && resolved.type ? String(resolved.type) : '';
            const targetId = resolved && resolved.id ? String(resolved.id) : '';
            const className = targetId ? 'wiki-link' : 'wiki-link unresolved';
            return `<a href="#" class="${className}" data-note-action="wiki" data-wiki-title="${escapeAttr(cleanTitle)}" data-target-type="${escapeAttr(targetType)}" data-target-id="${escapeAttr(targetId)}">${escapeHtml(title)}</a>`;
        });
    }

    function sanitizeHtml(html) {
        const allowedTags = new Set([
            'A', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'UL', 'OL', 'LI',
            'BLOCKQUOTE', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
            'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'INPUT', 'SPAN', 'DIV'
        ]);
        const globalAttrs = new Set(['class', 'title', 'aria-label']);
        const attrsByTag = {
            A: new Set(['href', 'target', 'rel', 'data-note-action', 'data-wiki-title', 'data-bookmark-name', 'data-target-type', 'data-target-id']),
            IMG: new Set(['src', 'alt', 'width', 'height']),
            INPUT: new Set(['type', 'checked', 'disabled'])
        };
        const template = document.createElement('template');
        template.innerHTML = String(html || '');

        Array.from(template.content.querySelectorAll('*')).forEach((node) => {
            if (!allowedTags.has(node.tagName)) {
                node.replaceWith(...Array.from(node.childNodes));
                return;
            }

            Array.from(node.attributes).forEach((attr) => {
                const name = attr.name.toLowerCase();
                const tagAttrs = attrsByTag[node.tagName] || new Set();
                const allowed = globalAttrs.has(name) || tagAttrs.has(name) || name.startsWith('data-');
                if (!allowed || name.startsWith('on') || name === 'style') {
                    node.removeAttribute(attr.name);
                    return;
                }

                if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
                    node.removeAttribute(attr.name);
                }

                if (node.tagName === 'A' && name === 'target' && attr.value === '_blank') {
                    node.setAttribute('rel', 'noopener noreferrer');
                }

                if (node.tagName === 'INPUT' && name === 'type' && attr.value !== 'checkbox') {
                    node.removeAttribute(attr.name);
                }
            });
        });

        return template.innerHTML;
    }

    function renderMarkdownSafe(text, context = {}) {
        const source = annotateWikiLinks(String(text || '_Empty_'), context);
        let html = '';
        if (global.marked && typeof global.marked.parse === 'function') {
            try {
                if (typeof global.marked.setOptions === 'function') {
                    global.marked.setOptions({ breaks: true, gfm: true });
                }
                html = global.marked.parse(source || '_Empty_');
            } catch (error) {
                console.warn('[notesCore] Markdown parse failed:', error);
                html = escapeHtml(source || '_Empty_').replace(/\n/g, '<br>');
            }
        } else {
            html = escapeHtml(source || '_Empty_').replace(/\n/g, '<br>');
        }
        return sanitizeHtml(html);
    }

    global.NotesCore = {
        createEmptyBlock,
        normalizeBlock,
        parseBlocks,
        serializeBlocks,
        normalizeTaskIds,
        normalizeLinks,
        syncTaskIdsFromLinks,
        addEntityLink,
        removeEntityLink,
        noteLinksTo,
        getPlainText,
        extractTags,
        extractBookmarks,
        renderMarkdownSafe,
        sanitizeHtml,
        escapeHtml
    };
})(window);
