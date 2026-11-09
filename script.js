// Sidebar behaviour: search filter, "/" shortcut, click-to-expand while collapsed.
(function () {
    var toggle = document.getElementById('sb-toggle');
    var search = document.getElementById('sb-search');
    var sidebar = document.querySelector('.sidebar');
    if (!toggle || !search || !sidebar) return;

    var KEY = 'gv-sidebar-open';
    try {
        if (localStorage.getItem(KEY) === '1') toggle.checked = true;
    } catch (e) {}
    toggle.addEventListener('change', function () {
        try { localStorage.setItem(KEY, toggle.checked ? '1' : '0'); } catch (e) {}
    });

    function expand() {
        if (!toggle.checked) {
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));
        }
    }

    // Collapsed rail: clicking a group or the search icon opens the panel instead.
    sidebar.addEventListener('click', function (e) {
        if (toggle.checked) return;
        var summary = e.target.closest('summary');
        if (summary) {
            e.preventDefault();
            expand();
            summary.parentElement.open = true;
        } else if (e.target.closest('.sb-search')) {
            expand();
            search.focus();
        }
    });

    document.addEventListener('keydown', function (e) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag)) {
            e.preventDefault();
            expand();
            search.focus();
        } else if (e.key === 'Escape' && document.activeElement === search) {
            search.value = '';
            search.dispatchEvent(new Event('input'));
            search.blur();
        }
    });

    var links = sidebar.querySelectorAll('.sb-nav a');
    var groups = sidebar.querySelectorAll('.sb-group');
    var labels = sidebar.querySelectorAll('.sb-label');
    var wasOpen = [];

    search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        if (q && !wasOpen.length) groups.forEach(function (g) { wasOpen.push(g.open); });

        links.forEach(function (a) {
            a.classList.toggle('sb-hidden', !!q && a.textContent.toLowerCase().indexOf(q) === -1);
        });
        groups.forEach(function (g, i) {
            var titleHit = g.querySelector('summary').textContent.toLowerCase().indexOf(q) !== -1;
            if (q && titleHit) {
                g.querySelectorAll('.sb-sublink').forEach(function (a) { a.classList.remove('sb-hidden'); });
            }
            var any = g.querySelector('.sb-sublink:not(.sb-hidden)');
            g.classList.toggle('sb-hidden', !!q && !any && !titleHit);
            if (q) g.open = true;
            else if (wasOpen.length) g.open = wasOpen[i];
        });
        labels.forEach(function (l) { l.classList.toggle('sb-hidden', !!q); });
        if (!q) wasOpen = [];
    });
})();


// Product wheel: arc carousel driven by drag, slider, arrow keys or horizontal scroll.
(function () {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-wheel]').forEach(initWheel);

    function initWheel(root) {
        var items = Array.prototype.slice.call(root.querySelectorAll('.wheel-item'));
        var n = items.length;
        if (!n) return;

        var range = root.querySelector('.wheel-range');
        var elIndex = root.querySelector('[data-wheel-index]');
        var elTitle = root.querySelector('[data-wheel-title]');
        var elMeta = root.querySelector('[data-wheel-meta]');
        var elSub = root.querySelector('[data-wheel-sub]');
        var elCta = root.querySelector('[data-wheel-cta]');

        var pos = 0;        // current (animated) position
        var target = 0;     // where we are heading
        var shown = -1;     // index currently shown in the info panel
        var raf = null;
        var dragging = false;
        var moved = false;
        var swapTimer = null;

        root.classList.add('is-wheel');

        function clamp(v) { return Math.max(0, Math.min(n - 1, v)); }

        function layout() {
            var w = root.clientWidth, h = root.clientHeight;
            var narrow = w < 900;
            var itemW = narrow ? Math.min(220, w * 0.56) : Math.min(300, w * 0.26);
            var itemH = itemW * 0.75;
            root.style.setProperty('--item-w', itemW + 'px');
            root.style.setProperty('--item-h', itemH + 'px');

            var R = Math.max(w * 0.75, 520);            // orbit radius
            var step = narrow ? 0.46 : 0.36;            // radians between neighbours
            var cx = narrow ? w * 0.5 : w * 0.62;       // arc apex x
            var top = narrow ? h * 0.52 : h * 0.24;     // apex y (item top)

            items.forEach(function (el, i) {
                var d = Math.max(-4, Math.min(4, i - pos)), ad = Math.abs(d);
                el.style.visibility = ad > 3.2 ? 'hidden' : 'visible';
                var a = d * step;
                var x = cx + R * Math.sin(a) - itemW / 2;
                var y = top + R * (1 - Math.cos(a)) * 0.55 + ad * ad * 10;
                var s = 1 - Math.min(ad, 3) * 0.17;
                el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (a * 9).toFixed(2) + 'deg) scale(' + s.toFixed(3) + ')';
                el.style.opacity = Math.max(0, 1 - ad * 0.26).toFixed(2);
                el.style.zIndex = String(100 - Math.round(ad * 10));
            });

            var idx = Math.round(pos);
            items.forEach(function (el, i) { el.classList.toggle('is-active', i === idx); });
            if (range && !dragging) range.value = pos;
            if (idx !== shown) show(idx);
        }

        function show(idx) {
            var first = shown === -1;
            shown = idx;
            var it = items[idx];
            root.dispatchEvent(new CustomEvent('wheelchange', { detail: idx }));
            function apply() {
                elIndex.textContent = String(idx + 1).padStart(2, '0');
                elTitle.textContent = it.dataset.title;
                elMeta.textContent = it.dataset.meta;
                elMeta.hidden = !it.dataset.meta;
                elSub.textContent = it.dataset.sub;
                elSub.hidden = !it.dataset.sub;
                elCta.textContent = it.dataset.cta || 'View details';
                elCta.href = it.dataset.href;
                if (it.hasAttribute('data-external')) {
                    elCta.target = '_blank';
                    elCta.rel = 'noopener';
                } else {
                    elCta.removeAttribute('target');
                    elCta.removeAttribute('rel');
                }
                root.classList.remove('is-swapping');
            }
            if (first || reduce) { apply(); return; }
            root.classList.add('is-swapping');
            clearTimeout(swapTimer);
            swapTimer = setTimeout(apply, 140);
        }

        function tick() {
            var diff = target - pos;
            if (Math.abs(diff) < 0.002) {
                pos = target;
                raf = null;
            } else {
                pos += diff * (reduce ? 1 : 0.16);
                raf = requestAnimationFrame(tick);
            }
            layout();
        }

        function go(t) {
            target = clamp(t);
            if (!raf) raf = requestAnimationFrame(tick);
        }

        function settle() { go(Math.round(target)); }
        root._go = go;

        // drag
        var startX = 0, startPos = 0, downItem = null;
        root.addEventListener('pointerdown', function (e) {
            if (e.target.closest('a, input')) return;
            dragging = true;
            moved = false;
            downItem = e.target.closest('.wheel-item');
            startX = e.clientX;
            startPos = pos;
            root.classList.add('is-dragging');
            try { root.setPointerCapture(e.pointerId); } catch (err) {}
        });
        root.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - startX;
            if (Math.abs(dx) > 4) moved = true;
            var itemW = parseFloat(getComputedStyle(root).getPropertyValue('--item-w')) || 260;
            pos = target = clamp(startPos - dx / (itemW * 0.8));
            layout();
        });
        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            root.classList.remove('is-dragging');
            if (!moved && downItem && e.type === 'pointerup') go(items.indexOf(downItem));
            else settle();
            downItem = null;
        }
        root.addEventListener('pointerup', endDrag);
        root.addEventListener('pointercancel', endDrag);

        // slider
        if (range) {
            range.addEventListener('input', function () {
                dragging = true;
                pos = target = clamp(parseFloat(range.value));
                layout();
            });
            range.addEventListener('change', function () {
                dragging = false;
                settle();
            });
        }

        // keyboard
        root.addEventListener('keydown', function (e) {
            if (e.target === range) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(Math.round(target) + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(Math.round(target) - 1); }
            else if (e.key === 'Home') { e.preventDefault(); go(0); }
            else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
        });

        // horizontal trackpad / shift+wheel (vertical wheel keeps scrolling the page)
        var wheelTimer = null;
        root.addEventListener('wheel', function (e) {
            var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
            if (!dx) return;
            e.preventDefault();
            pos = target = clamp(target + dx / 320);
            layout();
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(settle, 140);
        }, { passive: false });

        window.addEventListener('resize', layout);
        layout();
    }
})();


// Scroll-stack cards: reveal on enter, and sink earlier cards as the next one slides over them.
(function () {
    var grids = document.querySelectorAll('.grid');
    if (!grids.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.documentElement.classList.add('js-cards');

    var all = [];
    grids.forEach(function (grid) {
        var cards = Array.prototype.slice.call(grid.children).filter(function (c) {
            return c.classList.contains('card');
        });
        cards.forEach(function (c, i) { c.style.setProperty('--i', i); });
        all.push(cards);
    });

    // reveal
    if ('IntersectionObserver' in window && !reduce) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.18 });
        all.forEach(function (cards) { cards.forEach(function (c) { io.observe(c); }); });
    } else {
        all.forEach(function (cards) { cards.forEach(function (c) { c.classList.add('is-in'); }); });
    }

    // stack depth
    if (reduce) return;
    var ticking = false;
    function update() {
        ticking = false;
        all.forEach(function (cards) {
            for (var i = 0; i < cards.length - 1; i++) {
                var card = cards[i];
                var next = cards[i + 1];
                var stickTop = parseFloat(getComputedStyle(card).top) || 0;
                var h = card.offsetHeight || 1;
                // how far the next card has travelled over this one (0 → 1)
                var covered = (stickTop + h - next.getBoundingClientRect().top) / h;
                covered = Math.max(0, Math.min(1, covered));
                // only sink once this card is actually stuck
                var stuck = card.getBoundingClientRect().top <= stickTop + 1;
                card.style.setProperty('--sink', stuck ? covered.toFixed(3) : 0);
            }
        });
    }
    function onScroll() {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
})();


// About page: scroll reveal, count-up numbers, and category chips that jump around the wheel.
(function () {
    var reveals = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reveals.length && 'IntersectionObserver' in window && !reduce) {
        document.documentElement.classList.add('js-reveal');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                e.target.classList.add('is-in');
                io.unobserve(e.target);
                e.target.querySelectorAll('[data-count]').forEach(countUp);
            });
        }, { threshold: 0.15 });
        reveals.forEach(function (el) { io.observe(el); });
    }

    function countUp(el) {
        var end = parseInt(el.dataset.count, 10);
        if (!end || reduce) return;
        var t0 = null;
        function frame(t) {
            if (t0 === null) t0 = t;
            var p = Math.min(1, (t - t0) / 1200);
            el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(frame);
        }
        el.textContent = '0';
        requestAnimationFrame(frame);
    }

    // chips <-> wheel
    var chips = document.querySelectorAll('[data-wheel-jump]');
    if (!chips.length) return;
    var wheel = document.querySelector('[data-wheel]');
    if (!wheel) return;
    var starts = Array.prototype.map.call(chips, function (c) { return parseInt(c.dataset.wheelJump, 10); });

    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            if (wheel._go) wheel._go(parseInt(chip.dataset.wheelJump, 10));
        });
    });
    wheel.addEventListener('wheelchange', function (e) {
        var idx = e.detail, on = 0;
        for (var i = 1; i < starts.length; i++) if (idx >= starts[i]) on = i;
        chips.forEach(function (c, i) { c.classList.toggle('is-on', i === on); });
    });
})();
