/**
 * <cart-drawer-recommendations>
 * Loads in-stock product recommendations (based on the last item added
 * to the cart) into the cart drawer in a Dore & Rose style carousel,
 * and adds them to the cart without leaving the drawer.
 * The block stays hidden when the API returns nothing usable.
 */
if (!customElements.get('cart-drawer-recommendations')) {
  const cartRecsCache = new Map();

  class CartDrawerRecommendations extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', this.onClick);
      this.addEventListener('mousedown', this.onMouseDown);

      if (this.querySelector('.cart-recs__item')) {
        this.hidden = false;
      }

      const url = this.dataset.url;
      if (!url) return;
      const cacheKey = `${url}|${this.dataset.cartKey || ''}`;

      if (cartRecsCache.has(cacheKey)) {
        this.render(cartRecsCache.get(cacheKey));
        return;
      }

      fetch(url)
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) => {
          const html = this.extractInner(text);
          if (html) {
            cartRecsCache.set(cacheKey, html);
          }
          if (this.isConnected) this.render(html);
        })
        .catch(() => {
          if (!this.querySelector('.cart-recs__item')) {
            this.hidden = true;
          }
        });
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      this.removeEventListener('mousedown', this.onMouseDown);
    }

    onMouseDown = (event) => {
      const carousel = event.target.closest('.cart-recs__carousel');
      if (!carousel || event.button !== 0 || event.target.closest('button')) return;
      const startX = event.pageX;
      const startScrollLeft = carousel.scrollLeft;
      let dragged = false;

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.pageX - startX;
        if (Math.abs(dx) > 5) {
          dragged = true;
          carousel.classList.add('is-dragging');
        }
        if (dragged) {
          carousel.scrollLeft = startScrollLeft - dx;
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        carousel.classList.remove('is-dragging');
        if (dragged) {
          const suppressClick = (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            carousel.removeEventListener('click', suppressClick, true);
          };
          carousel.addEventListener('click', suppressClick, true);
          setTimeout(() => carousel.removeEventListener('click', suppressClick, true), 50);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    extractInner(text) {
      if (!text) return '';
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const inner = doc.querySelector('.cart-recs__inner');
      return inner && inner.querySelector('.cart-recs__item') ? inner.innerHTML : '';
    }

    render(html) {
      const target = this.querySelector('.cart-recs__content');
      if (!target) {
        this.hidden = true;
        return;
      }
      if (!html) {
        this.hidden = !target.querySelector('.cart-recs__item');
        return;
      }
      target.innerHTML = html;
      this.hidden = false;
    }

    onClick = (event) => {
      const button = event.target.closest('.cart-recs__add-button, .cart-recs__add');
      if (!button || !this.contains(button)) return;
      event.preventDefault();
      this.addToCart(button);
    };

    addToCart(button) {
      if (button.getAttribute('aria-disabled') === 'true') return;

      const cartDrawer = document.querySelector('cart-drawer');
      const variantId = Number(button.dataset.variantId);
      const errorEl = button.parentElement.querySelector('.cart-recs__error');

      button.setAttribute('aria-disabled', 'true');
      button.classList.add('loading');
      if (errorEl) errorEl.hidden = true;

      const body = {
        items: [{ id: variantId, quantity: 1 }],
      };
      if (cartDrawer) {
        body.sections = cartDrawer.getSectionsToRender().map((section) => section.id);
        body.sections_url = window.location.pathname;
      }

      fetch(`${window.routes.cart_add_url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status) {
            if (errorEl) {
              errorEl.textContent = data.description || data.message || '';
              errorEl.hidden = false;
            }
            button.removeAttribute('aria-disabled');
            button.classList.remove('loading');
            return;
          }

          cartRecsCache.clear();

          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'cart-drawer-recommendations',
              productVariantId: variantId,
              cartData: data,
            });
          }

          if (cartDrawer && data.sections) {
            cartDrawer.renderContents(data);
          } else {
            window.location = window.routes.cart_url;
          }
        })
        .catch(() => {
          button.removeAttribute('aria-disabled');
          button.classList.remove('loading');
        });
    }
  }

  customElements.define('cart-drawer-recommendations', CartDrawerRecommendations);
}
