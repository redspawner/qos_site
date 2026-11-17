/*
	Quinta Outeiro da Serva — site script

	This is the only script the site loads (no jQuery, no other libraries).
	What it does, in this order:

	  1. Page-opening animation   (fades the logo screen in)
	  2. Background slideshow      (crossfades the photos behind the page)
	  3. Menu                      ("Menu" button + slide-in panel on tablets/phones)
	  4. Scrolling                 (hides the logo screen while reading, pauses the slideshow)
	  5. Gallery                   (enlarged photo view with previous / next)
	  6. Videos                    (play only while they are on screen)

	The values you are most likely to want to change are in SETTINGS just below.
*/

(function () {
	'use strict';

	/* SETTINGS ------------------------------------------------------------- */

	// Background photos, in the order they are shown.
	// Each name needs two files in /images/slides/ :
	//   NAME-tall.webp  (1080 x 1920, upright)   used on phones / upright screens
	//   NAME-wide.webp  (1920 x 1280, landscape)  used on computers / wide screens
	// To add a photo: put both files in that folder and add its name to this list.
	// To change the very first photo, also update the two "bg/01-..." names in
	// assets/css/main.css (section "1. Background") and in the <head> of the pages
	// (they currently say "grapes-wide" and "grapes-tall").
	var SLIDES = ['grapes', 'hats', 'shade-table', 'horseshoe', 'roses', 'harvest',
	              'maria-gomes', 'olives', 'toast', 'oak-table', 'reading'];

	var SLIDE_HOLD = 3000;   // how long each photo stays fully visible (milliseconds)
	var SLIDE_FADE = 1000;   // how long the crossfade to the next photo takes (milliseconds)

	var LOGO_DELAY = 250;    // pause before the logo screen starts fading in (milliseconds)

	var MENU_LABEL = 'Menu'; // text of the menu button on tablets and phones

	// Words read aloud by screen readers in the enlarged gallery view.
	var WORDS = {
		pt: { close: 'Fechar', prev: 'Fotografia anterior', next: 'Fotografia seguinte', menu: 'Abrir o menu', closeMenu: 'Fechar o menu' },
		en: { close: 'Close', prev: 'Previous photo', next: 'Next photo', menu: 'Open the menu', closeMenu: 'Close the menu' },
		fr: { close: 'Fermer', prev: 'Photo précédente', next: 'Photo suivante', menu: 'Ouvrir le menu', closeMenu: 'Fermer le menu' }
	};

	/* ---------------------------------------------------------------------- */

	var doc = document,
		body = doc.body,
		intro = doc.getElementById('intro'),
		nav = doc.getElementById('nav'),
		main = doc.getElementById('main'),
		bg = doc.getElementById('bg'),
		isLanding = body.classList.contains('landing'),               // age-check / thank-you screens
		words = WORDS[(doc.documentElement.lang || 'pt').slice(0, 2)] || WORDS.pt,
		phoneLayout = window.matchMedia('(max-width: 980px)'),        // same limits as in main.css
		smallPhone = window.matchMedia('(max-width: 736px)'),
		lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

	var introOnScreen = true,   // is any part of the logo screen visible?
		menuToggle = null,
		slideshowCheck = null;  // set by the slideshow; called when visibility changes


	/* 1. PAGE-OPENING ANIMATION --------------------------------------------- */

	// The page starts with <body class="is-preload">, which keeps the logo screen
	// invisible. Removing the class lets it fade in (see "2. Page-opening
	// animation" in main.css). It no longer waits for photos to finish loading.

	window.setTimeout(function () {
		body.classList.remove('is-preload');
	}, isLanding ? 50 : LOGO_DELAY);


	/* 2. BACKGROUND SLIDESHOW ------------------------------------------------ */

	// The first photo is drawn by main.css, so it is there immediately.
	// From then on two stacked layers take turns: the next photo is loaded into
	// the hidden layer, which is then faded in on top of the other one.

	function startSlideshow() {
		var saveData = navigator.connection && navigator.connection.saveData;

		// One photo only: nothing to do. Reduced motion / data saver: stay on the first photo.
		if (!bg || isLanding || SLIDES.length < 2 || lessMotion.matches || saveData)
			return;

		var upright = window.matchMedia('(orientation: portrait)'),
			layers = [doc.createElement('div'), doc.createElement('div')],
			front = 0,          // which of the two layers is on top
			current = 0,        // position in SLIDES of the photo being shown
			timer = null,
			changing = false;

		layers.forEach(function (layer) {
			layer.className = 'slide';
			layer.style.transitionDuration = SLIDE_FADE + 'ms';
			bg.appendChild(layer);
		});

		function photo(i) {
			return '/images/slides/' + SLIDES[i] + (upright.matches ? '-tall' : '-wide') + '.webp';
		}

		// Only run while someone can actually see it: the tab is open and, on
		// tablets/phones, the logo screen is on screen (elsewhere the page covers it).
		function canRun() {
			return !doc.hidden && (introOnScreen || !phoneLayout.matches);
		}

		function schedule() {
			if (timer === null && !changing && canRun())
				timer = window.setTimeout(change, SLIDE_HOLD);
		}

		function change() {
			timer = null;

			if (!canRun())
				return;

			changing = true;

			var next = (current + 1) % SLIDES.length,
				src = photo(next),
				img = new Image();

			function done() {
				current = next;
				changing = false;
				schedule();
			}

			img.onload = function () {
				var layer = layers[front = 1 - front],
					under = layers[1 - front];

				layer.style.backgroundImage = 'url("' + src + '")';
				bg.appendChild(layer);              // put it on top
				void layer.offsetWidth;             // let the browser register the invisible state first
				layer.classList.add('show');        // fade in

				window.setTimeout(function () {
					under.classList.remove('show'); // the covered layer becomes the spare one
					done();
				}, SLIDE_FADE + 50);
			};

			img.onerror = done;                     // a missing photo is simply skipped
			img.src = src;
		}

		slideshowCheck = schedule;
		doc.addEventListener('visibilitychange', schedule);
		schedule();
	}

	// Start once everything visible has loaded, so the photos never compete
	// with the page itself for the connection.
	if (doc.readyState === 'complete')
		startSlideshow();
	else
		window.addEventListener('load', startSlideshow);


	/* 3. MENU (tablets and phones) ------------------------------------------- */

	// Builds the "Menu" button and the slide-in panel from the links that are
	// inside <nav id="nav"> on each page, so the links are only written once.

	function buildMenu() {
		var toggle = doc.createElement('a'),
			panel = doc.createElement('div'),
			links = doc.createElement('nav'),
			close = doc.createElement('a'),
			touchX = null;

		toggle.id = 'navPanelToggle';
		toggle.href = '#navPanel';
		toggle.textContent = MENU_LABEL;
		toggle.setAttribute('role', 'button');
		toggle.setAttribute('aria-label', words.menu);
		toggle.setAttribute('aria-expanded', 'false');

		panel.id = 'navPanel';
		links.innerHTML = nav.innerHTML;

		// Inside the panel the social icons use the template's outlined ("alt") look.
		[].forEach.call(links.querySelectorAll('.icons, .icon'), function (el) {
			el.classList.add('alt');
		});

		close.href = '#navPanel';
		close.className = 'close';
		close.setAttribute('role', 'button');
		close.setAttribute('aria-label', words.closeMenu);

		panel.appendChild(links);
		panel.appendChild(close);
		body.appendChild(toggle);
		body.appendChild(panel);

		function setOpen(open) {
			body.classList.toggle('is-navPanel-visible', open);
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		}

		toggle.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(!body.classList.contains('is-navPanel-visible'));
		});

		close.addEventListener('click', function (event) {
			event.preventDefault();
			setOpen(false);
		});

		// Choosing a link closes the panel (the browser then follows the link).
		links.addEventListener('click', function (event) {
			if (event.target.closest('a'))
				setOpen(false);
		});

		// So does tapping anywhere outside the panel, pressing Esc ...
		doc.addEventListener('click', function (event) {
			if (!panel.contains(event.target))
				setOpen(false);
		});

		doc.addEventListener('keydown', function (event) {
			if (event.key === 'Escape')
				setOpen(false);
		});

		// ... swiping the panel away to the right ...
		panel.addEventListener('touchstart', function (event) {
			touchX = event.touches[0].clientX;
		}, { passive: true });

		panel.addEventListener('touchend', function (event) {
			if (touchX !== null && event.changedTouches[0].clientX - touchX > 60)
				setOpen(false);

			touchX = null;
		}, { passive: true });

		// ... or widening the window until the normal menu is back.
		phoneLayout.addEventListener('change', function () {
			setOpen(false);
		});

		menuToggle = toggle;
	}

	if (nav)
		buildMenu();


	/* 4. SCROLLING ------------------------------------------------------------ */

	// Runs (at most once per screen refresh) while the visitor scrolls:
	//  - fades the logo screen out once the page content has moved up over it;
	//  - gives the Menu button its dark background once past the logo screen;
	//  - tells the slideshow whether the background can still be seen.

	var scrollQueued = false;

	function onScroll() {
		scrollQueued = false;

		var screenHeight = window.innerHeight;

		if (intro) {
			var introBox = intro.getBoundingClientRect();

			introOnScreen = introBox.bottom > 0 && introBox.top < screenHeight;

			if (main) {
				// Same trigger points as the original template:
				// phones: content has reached the upper third of the screen;
				// larger screens: content has covered the bottom quarter.
				var limit = screenHeight * (smallPhone.matches ? 0.35 : 0.75);

				intro.classList.toggle('hidden', main.getBoundingClientRect().top <= limit);
			}

			if (menuToggle)
				menuToggle.classList.toggle('alt', introBox.bottom < menuToggle.offsetHeight + 24);
		}
		else {
			introOnScreen = false;

			if (menuToggle)
				menuToggle.classList.add('alt');
		}

		if (slideshowCheck)
			slideshowCheck();
	}

	function queueScroll() {
		if (!scrollQueued) {
			scrollQueued = true;
			window.requestAnimationFrame(onScroll);
		}
	}

	if (!isLanding) {
		window.addEventListener('scroll', queueScroll, { passive: true });
		window.addEventListener('resize', queueScroll);
		window.addEventListener('load', queueScroll);
		onScroll();
	}


	/* 5. GALLERY: ENLARGED VIEW ------------------------------------------------ */

	// Any photo or video inside an element with class="gallery" opens enlarged
	// when clicked. A photo can name a bigger version to open:
	//   <img src="/images/gallery/thumb/1.webp" data-full="/images/gallery/1.webp" ...>
	// (without data-full, the same file is simply shown larger).

	var galleryItems = [].slice.call(doc.querySelectorAll('.gallery img, .gallery video'));

	if (galleryItems.length) {
		var box = null, boxImg, boxVideo, boxCount, shown = 0, swipeX = null, swipeY = null;

		var buildBox = function () {
			box = doc.createElement('div');
			box.id = 'lightbox';
			box.setAttribute('role', 'dialog');
			box.setAttribute('aria-modal', 'true');
			box.innerHTML =
				'<button type="button" class="close" aria-label="' + words.close + '"></button>' +
				'<button type="button" class="prev" aria-label="' + words.prev + '"></button>' +
				'<button type="button" class="next" aria-label="' + words.next + '"></button>' +
				'<img alt="" hidden>' +
				'<video controls playsinline hidden></video>' +
				'<p class="count"></p>';
			body.appendChild(box);

			boxImg = box.querySelector('img');
			boxVideo = box.querySelector('video');
			boxCount = box.querySelector('.count');

			if (galleryItems.length < 2) {
				box.querySelector('.prev').hidden = true;
				box.querySelector('.next').hidden = true;
				boxCount.hidden = true;
			}

			box.addEventListener('click', function (event) {
				var target = event.target;

				if (target.classList.contains('prev'))
					show(shown - 1);
				else if (target.classList.contains('next'))
					show(shown + 1);
				else if (target === box || target.classList.contains('close'))
					closeBox();
			});

			// Swipe left / right to move between photos.
			box.addEventListener('touchstart', function (event) {
				swipeX = event.touches[0].clientX;
				swipeY = event.touches[0].clientY;
			}, { passive: true });

			box.addEventListener('touchend', function (event) {
				if (swipeX === null)
					return;

				var dx = event.changedTouches[0].clientX - swipeX,
					dy = event.changedTouches[0].clientY - swipeY;

				swipeX = null;

				if (galleryItems.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
					show(shown + (dx < 0 ? 1 : -1));
			}, { passive: true });
		};

		var fullSize = function (item) {
			if (item.tagName === 'VIDEO') {
				var source = item.querySelector('source');
				return item.getAttribute('data-full') || item.currentSrc || (source ? source.src : item.src);
			}

			return item.getAttribute('data-full') || item.currentSrc || item.src;
		};

		var show = function (index) {
			var total = galleryItems.length,
				item;

			shown = (index + total) % total;      // going past the last photo returns to the first
			item = galleryItems[shown];

			boxVideo.pause();

			if (item.tagName === 'VIDEO') {
				boxImg.hidden = true;
				boxVideo.hidden = false;

				if (boxVideo.getAttribute('src') !== fullSize(item))
					boxVideo.src = fullSize(item);

				boxVideo.play().catch(function () {});
			}
			else {
				boxVideo.hidden = true;
				boxImg.hidden = false;
				boxImg.alt = item.alt;
				boxImg.src = fullSize(item);

				// Fetch the following photo in advance so "next" feels instant.
				if (total > 1 && galleryItems[(shown + 1) % total].tagName !== 'VIDEO')
					new Image().src = fullSize(galleryItems[(shown + 1) % total]);
			}

			boxCount.textContent = (shown + 1) + ' / ' + total;
		};

		var closeBox = function () {
			box.classList.remove('open');
			boxVideo.pause();
			doc.documentElement.style.overflow = '';
		};

		galleryItems.forEach(function (item, index) {
			item.addEventListener('click', function (event) {
				event.preventDefault();

				if (!box)
					buildBox();

				box.classList.add('open');
				doc.documentElement.style.overflow = 'hidden';   // the page behind does not scroll
				show(index);
				box.querySelector('.close').focus();
			});
		});

		doc.addEventListener('keydown', function (event) {
			if (!box || !box.classList.contains('open'))
				return;

			if (event.key === 'Escape')
				closeBox();
			else if (event.key === 'ArrowLeft' && galleryItems.length > 1)
				show(shown - 1);
			else if (event.key === 'ArrowRight' && galleryItems.length > 1)
				show(shown + 1);
		});
	}


	/* 6. VIDEOS ------------------------------------------------------------------ */

	// A silent, looping video in the page (the clip on the first gallery page)
	// starts playing when it scrolls into view and pauses when it leaves, so it
	// is never downloaded by visitors who do not reach it.

	var clips = doc.querySelectorAll('video[muted][loop]');

	if (clips.length && 'IntersectionObserver' in window && !lessMotion.matches) {
		var watcher = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting)
					entry.target.play().catch(function () {});
				else
					entry.target.pause();
			});
		}, { threshold: 0.25 });

		[].forEach.call(clips, function (clip) {
			clip.muted = true;
			watcher.observe(clip);
		});
	}

})();
