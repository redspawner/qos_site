(function($) {

	var	$window = $(window),
		$body = $('body'),
		$wrapper = $('#wrapper'),
		$header = $('#header'),
		$nav = $('#nav'),
		$main = $('#main'),
		$navPanelToggle, $navPanel, $navPanelInner;

	// Breakpoints.
	breakpoints({
		default:   ['1681px',   null       ],
		xlarge:    ['1281px',   '1680px'   ],
		large:     ['981px',    '1280px'   ],
		medium:    ['737px',    '980px'    ],
		small:     ['481px',    '736px'    ],
		xsmall:    ['361px',    '480px'    ],
		xxsmall:   [null,       '360px'    ]
	});

	/**
	 * Applies parallax scrolling to an element's background image.
	 */
	$.fn._parallax = function(intensity) { /* ... your existing _parallax code ... */ };

	// Play initial animations on page load.
	$window.on('load', function() {
		$body.removeClass('is-preload');

		window.setTimeout(function() {
		    $body.addClass('intro-visible');
  		}, 2000);
	});

	// Scrolly.
	$('.scrolly').scrolly();

	// Background.
	$wrapper._parallax(0.75);

	// Nav Panel Toggle
	$navPanelToggle = $('<a href="#navPanel" id="navPanelToggle">Menu</a>').appendTo($wrapper);

	// Change toggle styling once we've scrolled past the header
	$header.scrollex({
		bottom: '5vh',
		enter: function() { $navPanelToggle.removeClass('alt'); },
		leave: function() { $navPanelToggle.addClass('alt'); }
	});

	// Panel
	$navPanel = $('<div id="navPanel"><nav></nav><a href="#navPanel" class="close"></a></div>')
		.appendTo($body)
		.panel({
			delay: 500,
			hideOnClick: true,
			hideOnSwipe: true,
			resetScroll: true,
			resetForms: true,
			side: 'right',
			target: $body,
			visibleClass: 'is-navPanel-visible'
		});

	$navPanelInner = $navPanel.children('nav');

	// Move nav content on breakpoint change
	var $navContent = $nav.children();

	breakpoints.on('>medium', function() {
		$navContent.appendTo($nav);
		$nav.find('.icons, .icon').removeClass('alt');
	});

	breakpoints.on('<=medium', function() {
		$navContent.appendTo($navPanelInner);
		$navPanelInner.find('.icons, .icon').addClass('alt');
	});

	// Hack: Disable transitions on WP
	if (browser.os == 'wp' && browser.osVersion < 10)
		$navPanel.css('transition', 'none');

	// Intro handling
	var $intro = $('#intro');
	if ($intro.length > 0) {

		if (browser.name == 'ie') {
			$window.on('resize.ie-intro-fix', function() {
				var h = $intro.height();
				$intro.css('height', h > $window.height() ? 'auto' : h);
			}).trigger('resize.ie-intro-fix');
		}

		breakpoints.on('>small', function() {
			$main.unscrollex();
			$main.scrollex({
				mode: 'bottom',
				top: '25vh',
				bottom: '-50vh',
				enter: function() { $intro.addClass('hidden'); },
				leave: function() { $intro.removeClass('hidden'); }
			});
		});

		breakpoints.on('<=small', function() {
			$main.unscrollex();
			$main.scrollex({
				mode: 'middle',
				top: '15vh',
				bottom: '-15vh',
				enter: function() { $intro.addClass('hidden'); },
				leave: function() { $intro.removeClass('hidden'); }
			});
		});
	}









// Select both gallery images and any anchor wrapping a video
document.querySelectorAll('.box.alt img, a.image.main video').forEach(media => {
  media.addEventListener('click', () => {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxVideo = document.getElementById('lightbox-video');

    lightbox.style.display = 'flex';

    // Reset states
    lightboxImg.style.display = 'none';
    lightboxVideo.style.display = 'none';
    lightboxVideo.pause();

    let src = media.getAttribute('src');

    // If it's a <video>, grab its <source>
    if (media.tagName.toLowerCase() === 'video') {
      const source = media.querySelector('source');
      if (source) src = source.getAttribute('src');
    }

    if (src.endsWith('.mp4')) {
      // Show video
      lightboxVideo.querySelector('source').src = src;
      lightboxVideo.load();
      lightboxVideo.style.display = 'block';
    } else {
      // Show image
      lightboxImg.src = src;
      lightboxImg.style.display = 'block';
    }
  });
});

// Close button
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('close')) {
    const lightbox = document.getElementById('lightbox');
    const lightboxVideo = document.getElementById('lightbox-video');

    lightbox.style.display = 'none';
    lightboxVideo.pause();
  }
});

// Close when clicking the background
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') {
    e.currentTarget.style.display = 'none';
    document.getElementById('lightbox-video').pause();
  }
});






	
	// ✅ Mobile-only smooth scroll fix for .scrolly
	breakpoints.on('<=medium', function() {
		$('#intro .scrolly').off('click').on('click', function(e) {
			e.preventDefault(); // prevent default jump
			var targetOffset = $('#main').offset().top;
			$('html, body').animate({ scrollTop: targetOffset }, 800);
		});
	});

	breakpoints.on('>medium', function() {
		// Restore default scrolly behavior on desktop
		$('#intro .scrolly').off('click').scrolly();
	});

})(jQuery);
