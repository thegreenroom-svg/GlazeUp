/* ═══════════════════════════════════════════════════════════════════
   MONEY SCREEN — Live Revenue Canvas Rebuild
   Director-exclusive view of The Kiln Cafe's real financial health.
   22 Jul 2026
   ═══════════════════════════════════════════════════════════════════ */

const KC_Money = {
  ready: false,
  
  init() {
    if (!window.DEMO_SKIN || this.ready) return;
    this.ready = true;
    
    // Hook into the tab navigation system
    const originalGoToTab = window.goToTab;
    if (originalGoToTab) {
      window.goToTab = (tab, ...args) => {
        if (tab === 'money' || tab === 'dashboard') {
          // Ensure Money view is visible BEFORE transform
          const view = document.getElementById('dashboard-view');
          if (view) view.style.display = 'block';
          
          // Hide the Desk canvas
          const canvas = document.getElementById('kc-canvas');
          if (canvas) canvas.classList.add('kc-away');
          
          setTimeout(() => this.transform(), 50);
        }
        return originalGoToTab.call(window, tab, ...args);
      };
    }

    // Also hook showDashboardSection for internal Money navigation
    const originalShowSection = window.showDashboardSection;
    if (originalShowSection) {
      window.showDashboardSection = (section, ...args) => {
        setTimeout(() => this.transform(), 50);
        return originalShowSection.call(window, section, ...args);
      };
    }
  },

  transform() {
    const view = document.getElementById('dashboard-view');
    if (!view || !view.classList) return;
    
    // Mark as transformed
    if (view.classList.contains('kc-money-transformed')) return;
    view.classList.add('kc-money-transformed');

    // Rebuild the Money screen header
    this.buildHeader();
    
    // Enhance the tile-menu into modern pills
    this.modernizeTileMenu();
    
    // Style all section content
    this.enhanceSections();
    
    // Add wavy dividers
    this.addWavyDividers();
    
    // Enhance metric cards with hover effects
    this.enhanceMetricCards();
  },

  buildHeader() {
    const view = document.getElementById('dashboard-view');
    let header = view.querySelector('h2');
    
    if (!header) return;
    
    // Replace plain text header with styled serif version
    const h2Wrapper = document.createElement('div');
    h2Wrapper.style.cssText = `
      margin: 0 0 8px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(163, 45, 33, 0.2);
    `;
    
    const h2New = document.createElement('h2');
    h2New.textContent = '💰 The Studio';
    h2New.style.cssText = `
      margin: 0;
      font-family: 'Fraunces', serif;
      font-size: 32px;
      font-weight: 900;
      color: #A32D21;
      letter-spacing: -0.8px;
    `;
    
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Revenue, analytics, and growth';
    subtitle.style.cssText = `
      font-size: 13px;
      color: #888;
      margin-top: 4px;
      font-style: italic;
    `;
    
    h2Wrapper.appendChild(h2New);
    h2Wrapper.appendChild(subtitle);
    
    header.replaceWith(h2Wrapper);
  },

  modernizeTileMenu() {
    const menu = document.getElementById('dashboard-tile-menu');
    if (!menu) return;
    
    menu.style.cssText = `
      display: flex !important;
      flex-wrap: wrap;
      gap: 10px !important;
      margin-bottom: 20px !important;
    `;
    
    // Convert tile buttons to modern pills
    const tiles = menu.querySelectorAll('.glaze-tile');
    tiles.forEach(tile => {
      tile.style.cssText = `
        flex: 0 1 calc(50% - 5px) !important;
        background: linear-gradient(135deg, #FFF9F0 85%, rgba(255, 248, 240, 0.6)) !important;
        border: 1.5px solid rgba(163, 45, 33, 0.2) !important;
        border-radius: 10px !important;
        color: #2B2724 !important;
        padding: 12px 14px !important;
        height: auto !important;
        aspect-ratio: auto !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        text-align: left !important;
        cursor: pointer;
        transition: all 0.2s ease;
        gap: 10px;
      `;
      
      // Add hover effect
      tile.addEventListener('mouseenter', () => {
        tile.style.borderColor = 'rgba(163, 45, 33, 0.4)';
        tile.style.boxShadow = '0 8px 24px rgba(163, 45, 33, 0.15)';
      });
      
      tile.addEventListener('mouseleave', () => {
        tile.style.borderColor = 'rgba(163, 45, 33, 0.2)';
        tile.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
      });
      
      // Rebuild tile content
      const icon = tile.querySelector('span:first-child');
      const title = tile.querySelector('span:nth-child(2)');
      const desc = tile.querySelector('span:nth-child(3)');
      
      if (icon) icon.style.fontSize = '24px';
      if (title) {
        title.style.cssText = `
          font-family: 'Fraunces', serif;
          font-size: 14px;
          font-weight: 700;
          color: #A32D21;
          margin: 0;
        `;
      }
      if (desc) {
        desc.style.cssText = `
          font-size: 11px;
          color: #999;
          margin: 0;
        `;
      }
    });
  },

  enhanceSections() {
    const sections = document.querySelectorAll('.dashboard-section, .chart-container');
    sections.forEach(section => {
      section.style.cssText = `
        background: linear-gradient(135deg, rgba(243, 229, 245, 0.4), rgba(255, 248, 240, 0.6)) !important;
        border: 1.5px solid rgba(163, 45, 33, 0.15) !important;
        border-radius: 16px !important;
        padding: 20px !important;
        margin-bottom: 24px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
      `;
      
      // Style section titles
      const title = section.querySelector('h3');
      if (title) {
        title.style.cssText = `
          font-family: 'Fraunces', serif !important;
          font-size: 20px !important;
          font-weight: 700 !important;
          color: #A32D21 !important;
          margin: 0 0 16px 0 !important;
          letter-spacing: -0.5px !important;
        `;
      }
    });
  },

  addWavyDividers() {
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach((section, idx) => {
      if (idx > 0 && !section.querySelector('.kc-wavy-divider')) {
        const divider = document.createElement('div');
        divider.className = 'kc-wavy-divider';
        divider.style.cssText = `
          height: 1px;
          background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 8"><path d="M0,4 Q50,0 100,4 T200,4 T300,4 T400,4" stroke="%23A32D21" stroke-width="1" fill="none" opacity="0.2"/></svg>') repeat-x;
          background-size: 100px 1px;
          margin: -10px 0 10px 0;
        `;
        section.insertBefore(divider, section.firstChild);
      }
    });
  },

  enhanceMetricCards() {
    const cards = document.querySelectorAll('.metric-card');
    cards.forEach(card => {
      card.style.cssText = `
        background: #FFF9F0 !important;
        border: 1.5px solid rgba(184, 121, 70, 0.25) !important;
        border-radius: 12px !important;
        padding: 14px !important;
        text-align: center !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
        transition: all 0.2s ease !important;
      `;
      
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(163, 45, 33, 0.4)';
        card.style.boxShadow = '0 4px 12px rgba(163, 45, 33, 0.1)';
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(184, 121, 70, 0.25)';
        card.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
      });
      
      // Style card elements
      const label = card.querySelector('.label');
      const value = card.querySelector('.value');
      const detail = card.querySelector('.detail');
      
      if (label) {
        label.style.cssText = `
          font-size: 11px !important;
          color: #666 !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          margin-bottom: 8px !important;
        `;
      }
      
      if (value) {
        value.style.cssText = `
          font-family: 'Fraunces', serif !important;
          font-size: 22px !important;
          font-weight: 900 !important;
          color: #A32D21 !important;
          margin-bottom: 4px !important;
        `;
      }
      
      if (detail) {
        detail.style.cssText = `
          font-size: 10px !important;
          color: #999 !important;
          font-style: italic !important;
        `;
      }
    });
  }
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KC_Money.init());
} else {
  KC_Money.init();
}
