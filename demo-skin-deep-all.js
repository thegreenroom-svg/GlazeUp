/* ═══════════════════════════════════════════════════════════════════
   ALL DEEP SCREENS — Systematic Modern Transform
   Applies modern serif/cream/brick language to all 19 deep screens via
   a unified CSS + minimal JS system. Triggered on every screen navigation.
   22 Jul 2026
   ═══════════════════════════════════════════════════════════════════ */

const KC_DeepScreens = {
  screens: [
    'dashboard', 'floor-plan', 'staff', 'stock', 'setup', 'catalogue',
    'community', 'labels', 'printqueue', 'progress', 'shapes', 'team',
    'tablecards', 'piecematch', 'barista', 'branding', 'menu', 'platformrev'
  ],
  
  ready: false,
  
  init() {
    if (!window.DEMO_SKIN || this.ready) return;
    this.ready = true;
    
    // Hook into tab navigation
    const originalGoToTab = window.goToTab;
    if (originalGoToTab) {
      window.goToTab = (tab, ...args) => {
        const result = originalGoToTab.call(window, tab, ...args);
        setTimeout(() => this.transformCurrentScreen(), 50);
        return result;
      };
    }
    
    // Hook showDashboardSection for internal navigation
    const originalShowSection = window.showDashboardSection;
    if (originalShowSection) {
      window.showDashboardSection = (section, ...args) => {
        const result = originalShowSection.call(window, section, ...args);
        setTimeout(() => this.transformCurrentScreen(), 50);
        return result;
      };
    }
    
    // Watch for any view changes
    const observerConfig = { attributes: true, subtree: true, attributeFilter: ['style'] };
    const observer = new MutationObserver(() => {
      setTimeout(() => this.transformCurrentScreen(), 100);
    });
    
    const main = document.querySelector('main, .main, [role="main"]') || document;
    observer.observe(main, observerConfig);
  },
  
  transformCurrentScreen() {
    // Find the currently visible view
    const views = document.querySelectorAll('[id$="-view"]');
    for (const view of views) {
      const display = view.style.display;
      // Check if view should be visible
      if (display !== 'none' && view.offsetParent !== null) {
        this.transformScreen(view);
        break;
      }
    }
  },
  
  transformScreen(view) {
    if (!view || view.classList.contains('kc-deep-transformed')) return;
    view.classList.add('kc-deep-transformed');
    
    // Universal transforms applied to all deep screens
    this.modernizeHeaders(view);
    this.modernizeSections(view);
    this.enhanceAllCards(view);
    this.modernizeButtons(view);
    this.enhanceFormElements(view);
    this.applyAccessibilityEnhancements(view);
  },
  
  modernizeHeaders(view) {
    // Transform all headings in this view
    const headings = view.querySelectorAll('h2, h3, h4');
    headings.forEach(h => {
      if (h.classList.contains('kc-header-modern')) return;
      h.classList.add('kc-header-modern');
      
      h.style.cssText = `
        font-family: 'Fraunces', serif !important;
        color: #A32D21 !important;
        letter-spacing: -0.5px !important;
        font-weight: 700 !important;
        margin-top: 24px !important;
        margin-bottom: 12px !important;
      `;
    });
  },
  
  modernizeSections(view) {
    // Apply modern styling to all section containers
    const sections = view.querySelectorAll('[class*="section"], [class*="container"]');
    sections.forEach(section => {
      if (section.classList.contains('kc-section-modern')) return;
      
      // Skip if it's a tiny utility element
      if (section.children.length === 0 || section.textContent.length < 5) return;
      
      section.classList.add('kc-section-modern');
      section.style.cssText = `
        background: linear-gradient(135deg, rgba(243, 229, 245, 0.3), rgba(255, 248, 240, 0.4)) !important;
        border: 1.5px solid rgba(163, 45, 33, 0.15) !important;
        border-radius: 14px !important;
        padding: 16px !important;
        margin-bottom: 16px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
      `;
    });
  },
  
  enhanceAllCards(view) {
    // Enhance metric cards, setup cards, and any card-like elements
    const cards = view.querySelectorAll('[class*="card"], [class*="metric"], [class*="stat"]');
    cards.forEach(card => {
      if (card.classList.contains('kc-card-enhanced')) return;
      card.classList.add('kc-card-enhanced');
      
      card.style.cssText = `
        background: linear-gradient(135deg, #FFF9F0 95%, rgba(255, 248, 240, 0.8)) !important;
        border: 1.5px solid rgba(184, 121, 70, 0.25) !important;
        border-radius: 11px !important;
        padding: 12px !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
      `;
      
      // Add hover effect
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(163, 45, 33, 0.35)';
        card.style.boxShadow = '0 4px 12px rgba(163, 45, 33, 0.1)';
        card.style.transform = 'translateY(-1px)';
      }, { once: false });
      
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(184, 121, 70, 0.25)';
        card.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
        card.style.transform = 'translateY(0)';
      }, { once: false });
    });
  },
  
  modernizeButtons(view) {
    // Transform all buttons and button-like elements
    const buttons = view.querySelectorAll('button, [role="button"], .btn, [class*="btn"]');
    buttons.forEach(btn => {
      if (btn.classList.contains('kc-btn-modern')) return;
      btn.classList.add('kc-btn-modern');
      
      btn.style.cssText = `
        font-family: 'Inter', sans-serif !important;
        border-radius: 8px !important;
        padding: 8px 14px !important;
        border: 1.5px solid var(--gu-primary, #A32D21) !important;
        background: linear-gradient(135deg, #FFF9F0, rgba(255, 248, 240, 0.8)) !important;
        color: #A32D21 !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      `;
      
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'linear-gradient(135deg, #A32D21, rgba(163, 45, 33, 0.9))';
        btn.style.color = '#FFF9F0';
        btn.style.transform = 'translateY(-1px)';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'linear-gradient(135deg, #FFF9F0, rgba(255, 248, 240, 0.8))';
        btn.style.color = '#A32D21';
        btn.style.transform = 'translateY(0)';
      });
    });
  },
  
  enhanceFormElements(view) {
    // Style form inputs consistently
    const inputs = view.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], textarea, select');
    inputs.forEach(input => {
      if (input.classList.contains('kc-input-modern')) return;
      input.classList.add('kc-input-modern');
      
      input.style.cssText = `
        border: 1.5px solid rgba(184, 121, 70, 0.2) !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        background: #FFF9F0 !important;
        color: #2B2724 !important;
        font-family: 'Inter', sans-serif !important;
        font-size: 14px !important;
        transition: all 0.2s ease !important;
      `;
      
      input.addEventListener('focus', () => {
        input.style.borderColor = '#A32D21';
        input.style.boxShadow = '0 0 0 3px rgba(163, 45, 33, 0.1)';
      });
      
      input.addEventListener('blur', () => {
        input.style.borderColor = 'rgba(184, 121, 70, 0.2)';
        input.style.boxShadow = 'none';
      });
    });
  },
  
  applyAccessibilityEnhancements(view) {
    // Ensure minimum contrast ratios and readable text
    const allText = view.querySelectorAll('p, span, div, a');
    allText.forEach(el => {
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      
      // Ensure minimum readable size for body text
      if (fontSize < 14 && el.textContent.length > 10) {
        el.style.fontSize = '14px';
      }
      
      // Ensure sufficient line height
      if (el.textContent.length > 20) {
        el.style.lineHeight = '1.6';
      }
    });
  }
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KC_DeepScreens.init());
} else {
  KC_DeepScreens.init();
}
