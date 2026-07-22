/* ═══════════════════════════════════════════════════════════════════
   STAFF SCREEN — Modern Profile Cards & Role Layout
   Team management, shift tracking, and performance.
   22 Jul 2026
   ═══════════════════════════════════════════════════════════════════ */

const KC_Staff = {
  ready: false,
  
  init() {
    if (!window.DEMO_SKIN || this.ready) return;
    this.ready = true;
    
    const originalGoToTab = window.goToTab;
    if (originalGoToTab) {
      window.goToTab = (tab, ...args) => {
        if (tab === 'staff') {
          const view = document.getElementById('staff-view');
          if (view) view.style.display = 'block';
          const canvas = document.getElementById('kc-canvas');
          if (canvas) canvas.classList.add('kc-away');
          setTimeout(() => this.transform(), 100);
        }
        return originalGoToTab.call(window, tab, ...args);
      };
    }
  },
  
  transform() {
    const view = document.getElementById('staff-view');
    if (!view || view.classList.contains('kc-staff-modern')) return;
    view.classList.add('kc-staff-modern');
    
    this.modernizeHeader(view);
    this.enhanceProfileCards(view);
    this.modernizeRoleTabs(view);
    this.enhanceShiftDisplay(view);
  },
  
  modernizeHeader(view) {
    let header = view.querySelector('h2');
    if (!header) return;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin: 0 0 16px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(79, 70, 229, 0.2);
    `;
    
    const h2New = document.createElement('h2');
    h2New.textContent = 'The Team';
    h2New.style.cssText = `
      margin: 0;
      font-family: 'Inter', sans-serif;
      font-size: 32px;
      font-weight: 900;
      color: var(--m-accent);
      letter-spacing: -0.8px;
    `;
    
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Staff profiles, shifts, and roles';
    subtitle.style.cssText = `
      font-size: 13px;
      color: #888;
      margin-top: 4px;
      font-weight: 500;
    `;
    
    wrapper.appendChild(h2New);
    wrapper.appendChild(subtitle);
    header.replaceWith(wrapper);
  },
  
  enhanceProfileCards(view) {
    // Find and enhance staff profile card containers
    const cards = view.querySelectorAll('[class*="staff"], [class*="profile"], [class*="card"]');
    cards.forEach(card => {
      if (card.classList.contains('kc-profile-modern')) return;
      card.classList.add('kc-profile-modern');
      
      card.style.cssText = `
        background: linear-gradient(135deg, var(--m-surface) 90%, rgba(255, 255, 255, 0.7)) !important;
        border: 1.5px solid rgba(17, 19, 24, 0.25) !important;
        border-radius: 12px !important;
        padding: 14px !important;
        margin-bottom: 12px !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        display: flex !important;
        flex-direction: column !important;
      `;
      
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(79, 70, 229, 0.35)';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.12)';
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(17, 19, 24, 0.25)';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
      });
    });
  },
  
  modernizeRoleTabs(view) {
    // Style role/position indicator tabs
    const tabs = view.querySelectorAll('[class*="tab"], [class*="role"], [class*="badge"]');
    tabs.forEach(tab => {
      if (tab.classList.contains('kc-tab-modern')) return;
      tab.classList.add('kc-tab-modern');
      
      tab.style.cssText = `
        background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(17, 19, 24, 0.1)) !important;
        border: 1px solid rgba(79, 70, 229, 0.25) !important;
        border-radius: 6px !important;
        padding: 6px 12px !important;
        font-weight: 600 !important;
        font-size: 12px !important;
        color: var(--m-accent) !important;
        display: inline-block !important;
      `;
    });
  },
  
  enhanceShiftDisplay(view) {
    // Style shift time displays
    const timeElements = view.querySelectorAll('[class*="shift"], [class*="time"], [class*="schedule"]');
    timeElements.forEach(elem => {
      if (elem.classList.contains('kc-shift-enhanced')) return;
      elem.classList.add('kc-shift-enhanced');
      
      elem.style.cssText = `
        font-family: 'Inter', sans-serif !important;
        font-weight: 700 !important;
        color: var(--m-accent) !important;
        padding: 4px 8px !important;
        background: rgba(79, 70, 229, 0.06) !important;
        border-radius: 4px !important;
      `;
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KC_Staff.init());
} else {
  KC_Staff.init();
}
