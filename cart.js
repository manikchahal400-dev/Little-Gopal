/* Little Gopal — shared shopping cart, customer & order storage.
   Included on every page so the cart, account and orders stay in sync
   across index.html, collection.html, beauty.html and product.html. */
(function () {
  'use strict';

  // Lightweight, aggregate-only site analytics (no per-visitor tracking,
  // no cookies) so the admin can see page views, popular searches and
  // most-viewed products to improve the site. Never throws, never blocks
  // the page it's called from -- if it fails, it just fails silently.
  function trackBeacon(event, extra) {
    try {
      var payload = Object.assign({ event: event, device: (window.innerWidth < 800 ? 'mobile' : 'desktop') }, extra || {});
      fetch('/api/track/beacon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  function currentPageName() {
    var path = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    return path || 'index';
  }

  var CART_KEY = 'littleGopalCart';
  var CUSTOMER_KEY = 'littleGopalCustomer';
  var ORDERS_KEY = 'littleGopalOrders';
  var PRODUCTS_KEY = 'littleGopalProducts';
  var WISHLIST_KEY = 'littleGopalWishlist';
  var REVIEWS_KEY = 'littleGopalReviews';
  var RETURN_REQUESTS_KEY = 'littleGopalReturnRequests';
  var IDENTITY_KEY = 'littleGopalIdentity';
  var COUPONS = { GOPAL10: 0.10 };
  var FREE_SHIPPING_FROM = 999;
  var SHIPPING_FEE = 49;
  var GIFT_WRAP_FEE = 39;

  // Verified customer identity (from OTP login) -- shared across every page,
  // not just account.html, so checkout/rewards can tell whether the current
  // browser belongs to a logged-in, verified customer.
  function getIdentity() {
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveIdentity(identity) { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); }
  function clearIdentity() { localStorage.removeItem(IDENTITY_KEY); }

  var CATEGORIES = {
    gopalji: 'Laddu Gopal ji',
    clothes: 'Divine Clothes',
    beauty: 'Beauty',
    natural: 'Natural Beauty',
    bathing: 'Bathing Essentials',
    singhasan: 'Singhasan & Swings',
    furniture: 'Furniture & Comfort',
    electric: 'Electric Items'
  };
  var CATEGORY_INTROS = {
    gopalji: 'Bring home your own Laddu Gopal ji, in the size that\'s right for your mandir — from a tiny size 0 to a grand size 20.',
    clothes: 'Graceful poshaks and dresses for Krishna ji and Radha Rani.',
    beauty: 'Beautiful adornments and seva essentials for the daily shringar of your beloved Thakur ji.',
    natural: 'Pure and gentle seva products, chosen for daily shringar.',
    bathing: 'Gentle soaps, shampoos and fragrances for the sacred bathing seva of Thakur ji.',
    singhasan: 'Beautiful divine seating, jhulas and palanas for the darshan of Krishna ji and Radha ji.',
    furniture: 'Comfortable seva essentials including mosquito nets, beds, fans and coolers for Thakur ji.',
    electric: 'Light up your mandir and celebration with divine electric accessories.'
  };

  var DEFAULT_PRODUCTS = [
    { id: 'laddu-gopal-ji', name: 'Laddu Gopal ji', price: 501, category: 'gopalji', icon: '🪷', badge: 'NEW', featured: true,
      description: 'Bring home your very own Laddu Gopal ji. Choose the size that suits your mandir — larger sizes are lovingly handcrafted and priced accordingly.',
      sizes: ['Size 0','Size 1','Size 2','Size 3','Size 4','Size 5','Size 6','Size 7','Size 8','Size 9','Size 10','Size 11','Size 12','Size 13','Size 14','Size 15','Size 16','Size 17','Size 18','Size 19','Size 20'],
      sizePrices: { 'Size 0':501,'Size 1':651,'Size 2':801,'Size 3':999,'Size 4':1199,'Size 5':1499,'Size 6':1799,'Size 7':2199,'Size 8':2599,'Size 9':2999,'Size 10':3499,'Size 11':3999,'Size 12':4599,'Size 13':5199,'Size 14':5899,'Size 15':6599,'Size 16':7399,'Size 17':8299,'Size 18':9299,'Size 19':10499,'Size 20':11999 },
      colors: [], inStock: true },
    { id: 'royal-krishna-poshak', name: 'Royal Krishna Poshak', price: 499, category: 'clothes', icon: '👑', badge: 'BESTSELLER', featured: true, description: 'A graceful poshak for Krishna ji, chosen for daily seva and festive darshan.', sizes: ['Small', 'Medium', 'Large'], colors: ['Classic', 'Pink', 'Yellow'], inStock: true },
    { id: 'velvet-winter-poshak', name: 'Velvet Winter Poshak', price: 650, category: 'clothes', icon: '🧥', badge: '', featured: false, description: 'A warm velvet poshak for winter seva.', sizes: ['Small', 'Medium', 'Large'], colors: ['Classic'], inStock: true },
    { id: 'radha-rani-lehenga', name: 'Radha Rani Lehenga', price: 799, category: 'clothes', icon: '🥻', badge: '', featured: false, description: 'A beautifully embroidered lehenga for Radha Rani.', sizes: ['Small', 'Medium', 'Large'], colors: ['Pink', 'Yellow'], inStock: true },
    { id: 'handwork-dress-set', name: 'Handwork Dress Set', price: 900, category: 'clothes', icon: '🪡', badge: '', featured: false, description: 'A festive dress set with intricate handwork.', sizes: ['Small', 'Medium', 'Large'], colors: ['Classic'], inStock: true },
    { id: 'yellow-basant-poshak', name: 'Yellow Basant Poshak', price: 550, category: 'clothes', icon: '🌼', badge: '', featured: false, description: 'A cheerful yellow poshak for Basant Panchami and spring seva.', sizes: ['Small', 'Medium', 'Large'], colors: ['Yellow'], inStock: true },
    { id: 'festival-poshak-set', name: 'Festival Poshak Set', price: 1200, category: 'clothes', icon: '🧿', badge: '', featured: false, description: 'A premium poshak set for special festival celebrations.', sizes: ['Small', 'Medium', 'Large'], colors: ['Classic', 'Pink'], inStock: true },

    { id: 'chandan-tilak', name: 'Chandan Tilak', price: 200, category: 'beauty', icon: '🌸', badge: '', featured: false, description: 'Pure chandan tilak for daily shringar.', sizes: [], colors: [], inStock: true },
    { id: 'divine-jewellery-set', name: 'Divine Jewellery Set', price: 200, category: 'beauty', icon: '📿', badge: '', featured: true, description: 'A beautiful jewellery set for shringar and festive adornment.', sizes: [], colors: [], inStock: true },
    { id: 'silk-mukut-ornament', name: 'Silk Mukut Ornament', price: 280, category: 'beauty', icon: '🎀', badge: '', featured: false, description: 'An elegant silk mukut ornament for daily darshan.', sizes: [], colors: [], inStock: true },
    { id: 'flower-garland', name: 'Flower Garland', price: 150, category: 'beauty', icon: '🌺', badge: '', featured: false, description: 'A fresh-style flower garland for seva.', sizes: [], colors: [], inStock: true },
    { id: 'premium-shringar-box', name: 'Premium Shringar Box', price: 450, category: 'beauty', icon: '✨', badge: '', featured: false, description: 'A complete shringar box with everything for daily adornment.', sizes: [], colors: [], inStock: true },
    { id: 'festival-crown-set', name: 'Festival Crown Set', price: 600, category: 'beauty', icon: '👑', badge: '', featured: false, description: 'A regal crown set for festival celebrations.', sizes: [], colors: [], inStock: true },

    { id: 'natural-chandan-tilak', name: 'Natural Chandan Tilak', price: 200, category: 'natural', icon: '🌸', badge: 'NEW', featured: true, description: 'Natural, gently prepared chandan tilak for daily seva.', sizes: [], colors: [], inStock: true },
    { id: 'herbal-rose-water', name: 'Herbal Rose Water', price: 250, category: 'natural', icon: '🌿', badge: '', featured: true, description: 'A gentle herbal rose water for seva and shringar.', sizes: [], colors: [], inStock: true },
    { id: 'pure-kesar-chandan', name: 'Pure Kesar Chandan', price: 300, category: 'natural', icon: '🍃', badge: '', featured: true, description: 'Pure kesar-infused chandan for tilak and seva.', sizes: [], colors: [], inStock: true },
    { id: 'natural-flower-oil', name: 'Natural Flower Oil', price: 350, category: 'natural', icon: '🌺', badge: '', featured: false, description: 'A natural flower-infused oil for daily seva.', sizes: [], colors: [], inStock: true },
    { id: 'sandalwood-paste', name: 'Sandalwood Paste', price: 450, category: 'natural', icon: '🪵', badge: '', featured: false, description: 'Pure sandalwood paste, freshly prepared.', sizes: [], colors: [], inStock: true },
    { id: 'traditional-kumkum', name: 'Traditional Kumkum', price: 150, category: 'natural', icon: '🫙', badge: '', featured: false, description: 'Traditional kumkum for daily tilak.', sizes: [], colors: [], inStock: true },

    { id: 'rose-fragrance-soap', name: 'Rose Fragrance Soap', price: 120, category: 'bathing', icon: '🧼', badge: '', featured: false, description: 'A gentle rose-fragranced soap for the sacred bathing seva.', sizes: [], colors: [], inStock: true },
    { id: 'herbal-bath-soap', name: 'Herbal Bath Soap', price: 150, category: 'bathing', icon: '🫧', badge: '', featured: false, description: 'A mild herbal soap for daily bathing seva.', sizes: [], colors: [], inStock: true },
    { id: 'herbal-bath-shampoo', name: 'Herbal Bath Shampoo', price: 220, category: 'bathing', icon: '🧴', badge: '', featured: false, description: 'A gentle herbal shampoo for bathing seva.', sizes: [], colors: [], inStock: true },
    { id: 'divine-sandal-perfume', name: 'Divine Sandal Perfume', price: 300, category: 'bathing', icon: '🌹', badge: '', featured: false, description: 'A soft sandalwood perfume for after bathing seva.', sizes: [], colors: [], inStock: true },
    { id: 'jasmine-body-mist', name: 'Jasmine Body Mist', price: 280, category: 'bathing', icon: '🪻', badge: '', featured: false, description: 'A light jasmine body mist for daily freshness.', sizes: [], colors: [], inStock: true },
    { id: 'rose-bath-water', name: 'Rose Bath Water', price: 250, category: 'bathing', icon: '💧', badge: '', featured: false, description: 'Fragrant rose water for the bathing ritual.', sizes: [], colors: [], inStock: true },

    { id: 'golden-singhasan', name: 'Golden Singhasan', price: 1299, category: 'singhasan', icon: '🛕', badge: '', featured: true, description: 'A golden-finish singhasan for daily darshan.', sizes: [], colors: [], inStock: true },
    { id: 'wooden-temple-seat', name: 'Wooden Temple Seat', price: 1500, category: 'singhasan', icon: '🏛️', badge: '', featured: false, description: 'A sturdy wooden temple seat, handcrafted with care.', sizes: [], colors: [], inStock: true },
    { id: 'silver-style-singhasan', name: 'Silver Style Singhasan', price: 2100, category: 'singhasan', icon: '✨', badge: '', featured: false, description: 'A premium silver-style singhasan for special occasions.', sizes: [], colors: [], inStock: true },
    { id: 'floral-backrest-seat', name: 'Floral Backrest Seat', price: 899, category: 'singhasan', icon: '🌸', badge: '', featured: false, description: 'A floral-patterned backrest seat for comfortable darshan.', sizes: [], colors: [], inStock: true },
    { id: 'wooden-palana', name: 'Wooden Palana', price: 1400, category: 'singhasan', icon: '🪵', badge: '', featured: false, description: 'A handcrafted wooden palana for restful seva.', sizes: [], colors: [], inStock: true },
    { id: 'royal-peacock-swing', name: 'Royal Peacock Swing', price: 1800, category: 'singhasan', icon: '🦚', badge: '', featured: false, description: 'A royal peacock-themed swing for festive seva.', sizes: [], colors: [], inStock: true },
    { id: 'pink-radha-jhula', name: 'Pink Radha Jhula', price: 1200, category: 'singhasan', icon: '🎀', badge: '', featured: false, description: 'A gentle pink jhula for Radha Rani.', sizes: [], colors: [], inStock: true },
    { id: 'golden-cradle', name: 'Golden Cradle', price: 2200, category: 'singhasan', icon: '✨', badge: '', featured: false, description: 'An elegant golden cradle for festive seva.', sizes: [], colors: [], inStock: true },

    { id: 'mosquito-net-set', name: 'Mosquito Net Set', price: 350, category: 'furniture', icon: '⛺', badge: '', featured: false, description: 'A protective mosquito net set for comfortable rest.', sizes: [], colors: [], inStock: true },
    { id: 'mini-seva-bed', name: 'Mini Seva Bed', price: 650, category: 'furniture', icon: '🛏️', badge: '', featured: false, description: 'A soft, comfortable mini bed for seva.', sizes: [], colors: [], inStock: true },
    { id: 'mini-seva-fan', name: 'Mini Seva Fan', price: 250, category: 'furniture', icon: '🪭', badge: '', featured: false, description: 'A small fan for keeping Thakur ji comfortable.', sizes: [], colors: [], inStock: true },
    { id: 'mini-air-cooler', name: 'Mini Air Cooler', price: 900, category: 'furniture', icon: '❄️', badge: '', featured: false, description: 'A mini air cooler for warm seasons.', sizes: [], colors: [], inStock: true },
    { id: 'soft-bedding-set', name: 'Soft Bedding Set', price: 450, category: 'furniture', icon: '🧺', badge: '', featured: false, description: 'A soft bedding set for restful seva.', sizes: [], colors: [], inStock: true },
    { id: 'royal-sleeping-set', name: 'Royal Sleeping Set', price: 750, category: 'furniture', icon: '🛌', badge: '', featured: false, description: 'A royal sleeping set for festive comfort.', sizes: [], colors: [], inStock: true },

    { id: 'led-diya-set', name: 'LED Diya Set', price: 100, category: 'electric', icon: '🪔', badge: '', featured: true, description: 'A safe, reusable LED diya set for daily aarti.', sizes: [], colors: [], inStock: true },
    { id: 'mandir-light-string', name: 'Mandir Light String', price: 350, category: 'electric', icon: '💡', badge: '', featured: false, description: 'A warm light string to decorate the mandir.', sizes: [], colors: [], inStock: true },
    { id: 'electric-jhanki-light', name: 'Electric Jhanki Light', price: 799, category: 'electric', icon: '✨', badge: '', featured: false, description: 'A festive electric light for jhanki decoration.', sizes: [], colors: [], inStock: true },
    { id: 'festival-led-set', name: 'Festival LED Set', price: 999, category: 'electric', icon: '🌟', badge: '', featured: false, description: 'A complete LED set for festival decoration.', sizes: [], colors: [], inStock: true },
    { id: 'musical-temple-bell', name: 'Musical Temple Bell', price: 650, category: 'electric', icon: '🔔', badge: '', featured: false, description: 'A musical bell for aarti and daily seva.', sizes: [], colors: [], inStock: true },
    { id: 'decorative-light-panel', name: 'Decorative Light Panel', price: 1200, category: 'electric', icon: '🎇', badge: '', featured: false, description: 'A decorative light panel for festive celebration.', sizes: [], colors: [], inStock: true }
  ];

  function toNumber(value) {
    if (typeof value === 'number') return value;
    var match = String(value).replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }
  function formatMoney(value) {
    return '₹' + Math.round(value).toLocaleString('en-IN');
  }
  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function getCart() { return readJSON(CART_KEY, []); }
  function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); renderDrawer(); }

  function addToCart(item, openDrawer) {
    var cart = getCart();
    var price = toNumber(item.price);
    var existing = null;
    for (var i = 0; i < cart.length; i++) if (cart[i].name === item.name) { existing = cart[i]; break; }
    if (existing) existing.qty += 1;
    else cart.push({ name: item.name, price: price, image: item.image || '🛍️', qty: 1 });
    saveCart(cart);
    trackBeacon('add_to_cart');
    if (openDrawer !== false) openDrawer_();
  }

  function setQty(name, qty) {
    var cart = getCart();
    if (qty <= 0) cart = cart.filter(function (p) { return p.name !== name; });
    else cart.forEach(function (p) { if (p.name === name) p.qty = qty; });
    saveCart(cart);
  }

  function removeFromCart(name) { saveCart(getCart().filter(function (p) { return p.name !== name; })); }
  function clearCart() { saveCart([]); }

  function getTotals(couponCode, opts) {
    opts = opts || {};
    var cart = getCart();
    var subtotal = cart.reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
    var count = cart.reduce(function (sum, i) { return sum + i.qty; }, 0);
    var rate = (couponCode && COUPONS[String(couponCode).toUpperCase()]) || 0;
    var couponDiscount = Math.round(subtotal * rate);
    // "Extra" discount = redeemed loyalty points + an applied referral bonus,
    // combined by the caller into one rupee amount. Capped so discounts can
    // never push the order below zero.
    var extraDiscount = Math.max(0, Math.round(Number(opts.extraDiscount) || 0));
    var maxExtra = Math.max(subtotal - couponDiscount, 0);
    if (extraDiscount > maxExtra) extraDiscount = maxExtra;
    var discount = couponDiscount + extraDiscount;
    var giftWrapFee = opts.giftWrap ? GIFT_WRAP_FEE : 0;
    var shipping = subtotal === 0 || (subtotal - discount) >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    var total = Math.max(subtotal - discount + shipping + giftWrapFee, 0);
    return {
      cart: cart, subtotal: subtotal, count: count,
      discount: discount, couponDiscount: couponDiscount, extraDiscount: extraDiscount,
      shipping: shipping, giftWrapFee: giftWrapFee, total: total
    };
  }

  function slugify(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  }
  // Products retired from the catalog by name/id. Listed here (not just deleted
  // from DEFAULT_PRODUCTS) so getProducts() actively strips them out of every
  // browser that already saved a copy of the old catalog to localStorage --
  // otherwise a product removed from the site code would keep showing up for
  // anyone who had already visited before the removal.
  var REMOVED_PRODUCT_IDS = ['peacock-jhula'];
  function getProducts() {
    var stored = readJSON(PRODUCTS_KEY, null);
    if (!stored) {
      stored = DEFAULT_PRODUCTS.slice();
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(stored));
      return stored;
    }
    var changed = false;
    // Add any new catalog products introduced since this browser last saved
    // its list (e.g. after a site update), without touching anything the
    // owner has already added, edited, or deleted.
    var existingIds = {};
    stored.forEach(function (p) { existingIds[p.id] = true; });
    var missing = DEFAULT_PRODUCTS.filter(function (p) { return !existingIds[p.id]; });
    if (missing.length) { stored = stored.concat(missing); changed = true; }
    // Strip out anything retired above.
    var beforeCount = stored.length;
    stored = stored.filter(function (p) { return REMOVED_PRODUCT_IDS.indexOf(p.id) === -1; });
    if (stored.length !== beforeCount) changed = true;
    if (changed) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(stored));
    return stored;
  }
  function saveProducts(list) { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list)); }
  function addProduct(product) {
    var list = getProducts();
    var id = product.id || (slugify(product.name) + '-' + Date.now().toString(36));
    var full = {
      id: id, name: product.name, price: toNumber(product.price), category: product.category,
      icon: product.icon || '🛍️', image: product.image || '', badge: product.badge || '', featured: !!product.featured,
      description: product.description || '', sizes: product.sizes || [], colors: product.colors || [],
      sizePrices: product.sizePrices || null, inStock: product.inStock !== false
    };
    list.push(full);
    saveProducts(list);
    return id;
  }
  function updateProduct(id, patch) {
    var list = getProducts();
    list.forEach(function (p) { if (p.id === id) Object.keys(patch).forEach(function (key) { p[key] = patch[key]; }); });
    saveProducts(list);
  }
  function deleteProduct(id) { saveProducts(getProducts().filter(function (p) { return p.id !== id; })); }

  // --- Shared catalog sync (server is the source of truth once seeded) ---
  // Every storefront page pulls the latest catalog on load so admin's
  // product changes actually reach real customers, not just the admin's
  // own browser. admin.html pushes the full catalog after every edit, and
  // always pulls first before editing so two admin devices don't clobber
  // each other's changes.
  function pullProductsFromServer() {
    return fetch('/api/products/get').then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.ok && Array.isArray(data.products)) { saveProducts(data.products); return true; }
      return false;
    }).catch(function () { return false; });
  }
  function pushProductsToServer() {
    return fetch('/api/products/update', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: getProducts() })
    }).then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); });
  }
  function getProductsByCategory(category) { return getProducts().filter(function (p) { return p.category === category; }); }
  function getFeaturedProducts() { return getProducts().filter(function (p) { return p.featured; }); }
  function getProductById(id) {
    var list = getProducts();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function getProductByName(name) {
    var list = getProducts();
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }
  function searchProducts(query) {
    var text = String(query).toLowerCase();
    return getProducts().filter(function (p) {
      if (p.name.toLowerCase().indexOf(text) !== -1) return true;
      if ((CATEGORIES[p.category] || '').toLowerCase().indexOf(text) !== -1) return true;
      if ((p.colors || []).some(function (c) { return c.toLowerCase().indexOf(text) !== -1; })) return true;
      if ((p.description || '').toLowerCase().indexOf(text) !== -1) return true;
      return false;
    });
  }

  // --- Wishlist ---
  function getWishlist() { return readJSON(WISHLIST_KEY, []); }
  function isWishlisted(productId) { return getWishlist().indexOf(productId) !== -1; }
  function toggleWishlist(productId) {
    var list = getWishlist();
    var idx = list.indexOf(productId);
    if (idx === -1) list.push(productId); else list.splice(idx, 1);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
    return idx === -1; // true if it was just added
  }

  // --- Reviews & ratings ---
  function getAllReviews() { return readJSON(REVIEWS_KEY, {}); }
  function getReviews(productId) { return getAllReviews()[productId] || []; }
  function addReview(productId, review) {
    var all = getAllReviews();
    all[productId] = all[productId] || [];
    all[productId].unshift({
      name: review.name || 'A devotee',
      rating: Math.max(1, Math.min(5, Math.round(review.rating) || 5)),
      comment: review.comment || '',
      date: new Date().toISOString()
    });
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(all));
  }
  function getRatingSummary(productId) {
    var reviews = getReviews(productId);
    if (!reviews.length) return { count: 0, average: 0 };
    var sum = reviews.reduce(function (s, r) { return s + r.rating; }, 0);
    return { count: reviews.length, average: Math.round((sum / reviews.length) * 10) / 10 };
  }
  // Resizes/compresses an uploaded image file client-side (no server) and
  // resolves with a JPEG data URI, so product photos stay small enough for
  // localStorage. maxDim caps the longest side in pixels.
  function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 640; quality = quality || 0.75;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Returns an <img> tag if the product has a real photo, otherwise the emoji icon as plain text.
  function visualHtml(p) {
    if (p && p.image) return '<img src="' + p.image + '" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">';
    return (p && p.icon) || '🛍️';
  }

  function starsHtml(rating, size) {
    var full = Math.round(rating);
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span style="color:' + (i <= full ? '#d59d36' : '#ddd0bd') + (size ? ';font-size:' + size : '') + '">★</span>';
    return out;
  }

  function getCustomer() { return readJSON(CUSTOMER_KEY, null); }
  function saveCustomer(customer) { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)); }

  // Remembers, per order, whether a return/replacement request has already
  // been submitted for it (and its last known status) so the "Apply for
  // return" button doesn't show again on this browser after submitting.
  // The actual request lives in shared server storage (see api/returns/*) so
  // the admin can see it from any device -- this local record is purely a
  // "did I already submit this?" UI memory, not the source of truth.
  function getReturnRequests() { return readJSON(RETURN_REQUESTS_KEY, {}); }
  function getReturnRequestForOrder(orderId) { return getReturnRequests()[orderId] || null; }
  function saveReturnRequestForOrder(orderId, record) {
    var all = getReturnRequests();
    all[orderId] = record;
    localStorage.setItem(RETURN_REQUESTS_KEY, JSON.stringify(all));
  }

  function getOrders() { return readJSON(ORDERS_KEY, []); }
  function placeOrder(order) {
    var orders = getOrders();
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    localStorage.setItem('littleGopalLastOrder', order.id);
    trackBeacon('order_placed');
    clearCart();
  }
  function getOrder(id) {
    var orders = getOrders();
    for (var i = 0; i < orders.length; i++) if (orders[i].id === id) return orders[i];
    return null;
  }
  function updateOrderStatus(id, status) {
    var orders = getOrders();
    orders.forEach(function (o) {
      if (o.id !== id) return;
      o.status = status;
      // Record when key milestones actually happened, not just the current
      // status -- lets the admin see a real delivered/cancelled date, not
      // just "Delivered" with no timestamp.
      if (status === 'Delivered' && !o.deliveredAt) o.deliveredAt = new Date().toISOString();
      if (status === 'Cancelled' && !o.cancelledAt) o.cancelledAt = new Date().toISOString();
    });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
  // Each order gets its own unique id: a base-36 millisecond timestamp
  // (already effectively unique on its own) plus 4 random base-36
  // characters, so two different customers -- or the same customer
  // ordering twice -- never end up with the same order id.
  function makeOrderId() {
    var ts = Date.now().toString(36).toUpperCase();
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'LG-' + ts + '-' + rand;
  }

  /* ---------------- Floating cart button + drawer (injected on every page) ---------------- */

  var drawerEl, itemsEl, totalEl, countEls;

  function ensureDrawer() {
    if (window.LG_NO_CART_UI) return;
    if (document.getElementById('lg-cart-drawer')) return;
    var style = document.createElement('style');
    style.textContent =
      '#lg-cart-toggle{position:fixed;right:22px;bottom:22px;z-index:40;border:0;border-radius:28px;background:#d0642a;color:#fff;padding:13px 17px;box-shadow:0 7px 20px #3b201d44;font:700 14px "DM Sans",sans-serif;cursor:pointer}' +
      '#lg-cart-toggle span{display:inline-block;margin-left:6px;background:#fff;color:#a54a2b;border-radius:12px;padding:2px 7px;font-size:11px}' +
      '#lg-cart-drawer{display:none;position:fixed;right:18px;bottom:82px;width:min(390px,calc(100vw - 36px));max-height:calc(100vh - 112px);overflow:auto;background:#fffdf8;z-index:41;border:1px solid #e6d2bb;border-radius:10px;box-shadow:0 15px 45px #2e1b1740;padding:18px;font-family:"DM Sans",sans-serif;color:#36201e}' +
      '#lg-cart-drawer.open{display:block}' +
      '.lg-cart-head{display:flex;align-items:center;gap:10px;margin:0 0 15px}' +
      '#lg-cart-back{border:1px solid #dfc8af;background:#fffdf8;color:#542d27;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;flex-shrink:0;line-height:1}' +
      '#lg-cart-drawer h2{font:700 26px "Playfair Display",serif;margin:0}' +
      '.lg-cart-item{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid #eedfce;font-size:14px}' +
      '.lg-cart-item strong{display:block;font-family:"Playfair Display",serif;font-weight:600}' +
      '.lg-cart-qty{display:flex;align-items:center;gap:8px;margin-top:6px}' +
      '.lg-cart-qty button{border:1px solid #dfc8af;background:#fffdf8;border-radius:3px;width:23px;height:23px;cursor:pointer}' +
      '.lg-remove{border:0;background:none;color:#b44b32;cursor:pointer;font-size:12px;padding:0}' +
      '.lg-cart-price{font-weight:700;color:#a34b2a;white-space:nowrap}' +
      '.lg-cart-total{display:flex;justify-content:space-between;border-top:1px solid #dfc8af;margin-top:7px;padding-top:14px;font-weight:700}' +
      '.lg-empty-cart{text-align:center;color:#785850;padding:20px 0;font-size:14px}' +
      '.lg-checkout-btn{width:100%;border:0;background:#542d27;color:#fff;border-radius:4px;padding:12px 13px;font-weight:700;cursor:pointer;margin-top:14px;font-size:14px;text-decoration:none;display:block;text-align:center;box-sizing:border-box}' +
      '.lg-checkout-btn.disabled{opacity:.5;pointer-events:none}' +
      '#lg-menu-toggle{position:fixed;top:14px;right:14px;z-index:50;border:0;border-radius:50%;width:42px;height:42px;background:#542d27;color:#fff8ec;font-size:19px;cursor:pointer;box-shadow:0 6px 16px #2e1b1750;line-height:1}' +
      '#lg-menu-panel{display:none;position:fixed;top:62px;right:14px;z-index:50;width:min(260px,calc(100vw - 28px));max-height:calc(100vh - 76px);overflow:auto;background:#fffdf8;border:1px solid #e6d2bb;border-radius:10px;box-shadow:0 15px 40px #2e1b1745;padding:8px;font-family:"DM Sans",sans-serif}' +
      '@media(max-width:520px){#lg-menu-toggle{top:64px}#lg-menu-panel{top:112px}}' +
      '#lg-menu-panel.open{display:block}' +
      '.lg-menu-link{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;text-align:left;border:0;background:none;color:#3a2422;text-decoration:none;padding:11px 10px;font:600 13.5px "DM Sans",sans-serif;cursor:pointer;border-radius:6px}' +
      '.lg-menu-link:hover{background:#f7ebda}' +
      '.lg-menu-divider{border:0;border-top:1px solid #eee0cf;margin:6px 4px}';
    document.head.appendChild(style);

    drawerEl = document.createElement('aside');
    drawerEl.id = 'lg-cart-drawer';
    drawerEl.innerHTML = '<div class="lg-cart-head"><button id="lg-cart-back" aria-label="Close cart" title="Close cart">←</button><h2>Your cart</h2></div><div id="lg-cart-items"></div>' +
      '<div class="lg-cart-total"><span>Total</span><span id="lg-cart-total">₹0</span></div>' +
      '<a class="lg-checkout-btn" id="lg-cart-checkout" href="checkout.html">Proceed to checkout</a>';
    document.body.appendChild(drawerEl);

    // The cart only closes when the customer explicitly presses this back
    // arrow -- not on an outside click, and not while they're mid-edit
    // (changing quantities used to close the drawer by accident because a
    // full re-render swapped out the button they'd just clicked).
    document.getElementById('lg-cart-back').addEventListener('click', function () {
      drawerEl.classList.remove('open');
    });

    var toggle = document.createElement('button');
    toggle.id = 'lg-cart-toggle';
    toggle.innerHTML = '🛒 Cart <span id="lg-cart-count">0</span>';
    toggle.addEventListener('click', function () {
      drawerEl.classList.toggle('open');
      renderDrawer();
    });
    document.body.appendChild(toggle);

    itemsEl = document.getElementById('lg-cart-items');
    totalEl = document.getElementById('lg-cart-total');

    itemsEl.addEventListener('click', function (event) {
      var button = event.target.closest('[data-lg]');
      if (!button) return;
      var name = button.getAttribute('data-name');
      var cart = getCart();
      var item = null;
      for (var i = 0; i < cart.length; i++) if (cart[i].name === name) { item = cart[i]; break; }
      if (!item) return;
      if (button.getAttribute('data-lg') === 'plus') setQty(name, item.qty + 1);
      else if (button.getAttribute('data-lg') === 'minus') setQty(name, item.qty - 1);
      else if (button.getAttribute('data-lg') === 'remove') removeFromCart(name);
    });

    renderDrawer();
  }

  function openDrawer_() {
    if (!drawerEl) ensureDrawer();
    drawerEl.classList.add('open');
    renderDrawer();
  }

  /* ---------------- Quick-access menu (☰ top-right, on every page) ---------------- */

  function ensureMenu() {
    if (window.LG_NO_CART_UI) return;
    if (document.getElementById('lg-menu-toggle')) return;

    var toggle = document.createElement('button');
    toggle.id = 'lg-menu-toggle';
    toggle.innerHTML = '☰';
    toggle.setAttribute('aria-label', 'Open menu');
    document.body.appendChild(toggle);

    var panel = document.createElement('div');
    panel.id = 'lg-menu-panel';
    panel.innerHTML =
      '<a class="lg-menu-link" href="index.html">🏠 Home</a>' +
      '<a class="lg-menu-link" href="index.html#collections">🛍️ All collections</a>' +
      '<a class="lg-menu-link" href="product.html?id=laddu-gopal-ji">🪷 Laddu Gopal ji</a>' +
      '<a class="lg-menu-link" href="index.html#bestsellers">⭐ Best sellers</a>' +
      '<a class="lg-menu-link" href="index.html#about">📖 Our story</a>' +
      '<a class="lg-menu-link" href="index.html#contact">📞 Contact</a>' +
      '<hr class="lg-menu-divider" />' +
      '<a class="lg-menu-link" href="account.html">👤 My account</a>' +
      '<a class="lg-menu-link" href="account.html">🧾 My orders</a>' +
      '<a class="lg-menu-link" href="account.html">❤️ Wishlist</a>' +
      '<button class="lg-menu-link" type="button" id="lg-menu-cart">🛒 View cart</button>' +
      '<hr class="lg-menu-divider" />' +
      '<a class="lg-menu-link" href="privacy-policy.html">Privacy policy</a>' +
      '<a class="lg-menu-link" href="terms.html">Terms of service</a>' +
      '<a class="lg-menu-link" href="refund-policy.html">Replacement policy</a>';
    document.body.appendChild(panel);

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      panel.classList.toggle('open');
    });
    document.getElementById('lg-menu-cart').addEventListener('click', function () {
      panel.classList.remove('open');
      openDrawer_();
    });
    document.addEventListener('click', function (event) {
      if (panel.classList.contains('open') && !panel.contains(event.target) && event.target !== toggle) {
        panel.classList.remove('open');
      }
    });
  }

  function renderDrawer() {
    if (!itemsEl) return;
    var totals = getTotals();
    var countBadge = document.getElementById('lg-cart-count');
    if (countBadge) countBadge.textContent = totals.count;
    itemsEl.innerHTML = totals.cart.length ? totals.cart.map(function (item) {
      return '<div class="lg-cart-item"><div><strong>' + escapeHtml(item.name) + '</strong>' +
        '<div class="lg-cart-qty">' +
        '<button data-lg="minus" data-name="' + escapeHtml(item.name) + '">−</button>' +
        '<span>' + item.qty + '</span>' +
        '<button data-lg="plus" data-name="' + escapeHtml(item.name) + '">+</button>' +
        '<button class="lg-remove" data-lg="remove" data-name="' + escapeHtml(item.name) + '">Remove</button>' +
        '</div></div><span class="lg-cart-price">' + formatMoney(item.price * item.qty) + '</span></div>';
    }).join('') : '<div class="lg-empty-cart">Your cart is empty. Add a beautiful product to begin.</div>';
    totalEl.textContent = formatMoney(totals.subtotal);
    var checkoutBtn = document.getElementById('lg-cart-checkout');
    if (checkoutBtn) checkoutBtn.classList.toggle('disabled', totals.cart.length === 0);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureUi() {
    ensureDrawer();
    ensureMenu();
    // Only count real storefront visits, not the admin's own dashboard use.
    if (!window.LG_NO_CART_UI) trackBeacon('page_view', { page: currentPageName() });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi);
  else ensureUi();

  window.LittleGopalStore = {
    CART_KEY: CART_KEY, CUSTOMER_KEY: CUSTOMER_KEY, ORDERS_KEY: ORDERS_KEY, PRODUCTS_KEY: PRODUCTS_KEY, COUPONS: COUPONS,
    FREE_SHIPPING_FROM: FREE_SHIPPING_FROM, SHIPPING_FEE: SHIPPING_FEE, GIFT_WRAP_FEE: GIFT_WRAP_FEE,
    CATEGORIES: CATEGORIES, CATEGORY_INTROS: CATEGORY_INTROS,
    toNumber: toNumber, formatMoney: formatMoney, escapeHtml: escapeHtml, slugify: slugify,
    getCart: getCart, addToCart: addToCart, setQty: setQty, removeFromCart: removeFromCart, clearCart: clearCart,
    getTotals: getTotals, openDrawer: openDrawer_, renderDrawer: renderDrawer,
    getCustomer: getCustomer, saveCustomer: saveCustomer,
    getIdentity: getIdentity, saveIdentity: saveIdentity, clearIdentity: clearIdentity,
    getReturnRequestForOrder: getReturnRequestForOrder, saveReturnRequestForOrder: saveReturnRequestForOrder,
    getOrders: getOrders, placeOrder: placeOrder, getOrder: getOrder, updateOrderStatus: updateOrderStatus, makeOrderId: makeOrderId,
    getProducts: getProducts, addProduct: addProduct, updateProduct: updateProduct, deleteProduct: deleteProduct,
    pullProductsFromServer: pullProductsFromServer, pushProductsToServer: pushProductsToServer,
    getProductsByCategory: getProductsByCategory, getFeaturedProducts: getFeaturedProducts,
    getProductById: getProductById, getProductByName: getProductByName, searchProducts: searchProducts,
    getWishlist: getWishlist, isWishlisted: isWishlisted, toggleWishlist: toggleWishlist,
    getReviews: getReviews, addReview: addReview, getRatingSummary: getRatingSummary, starsHtml: starsHtml,
    visualHtml: visualHtml, compressImage: compressImage, trackBeacon: trackBeacon
  };
})();
