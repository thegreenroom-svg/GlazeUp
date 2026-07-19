# GlazeUp System — Ready for Deployment

**Status**: Code fixes complete, ready for Render deployment  
**Commits**: 2 new (5ae2fed, 4b67bef) — both on GitHub  
**Time to deploy**: ~60 seconds on Render Dashboard

---

## What Was Broken (Root Causes)

1. **Splash screen failed to load** — `showSplash()` was called but never defined
2. **Login picker never appeared** — `dismissSplash()` wasn't triggering the full login flow  
3. **Page load didn't show splash** — Initial DOMContentLoaded wasn't ensuring splash displayed
4. **Navigation gates missing** — Splash dismissal wasn't calling `deviceCheckIn()` → `populateDashboard()` → `checkShiftLogin()`

## What's Been Fixed

✅ **showSplash()** — Now properly defined, displays splash and hides all other views  
✅ **wireSplash()** — Added error handling for renderElegantLineTable  
✅ **dismissSplash()** — Now triggers full login sequence correctly  
✅ **DOMContentLoaded** — Ensures splash displays on initial page load  
✅ **All navigation verified** — goToTab(), tile functions, table detail flow all intact

## What's Confirmed Working

- loadFloorPlan() API correctly filters live bookings  
- openTableDetail() → workflow navigation chain complete  
- All major tile functions defined (Packing, Customise, Kiln, etc.)  
- Customer app reads demo_active flag correctly  
- Loading bars (_loadStart/_loadDone) ready for progress feedback  
- Navigation trace logging for debugging  

---

## Testing Sequence (After Deployment)

### 1. **Splash → Login → Home**
   - Page loads → Splash shows with Kiln Cafe wordmark
   - Click splash → Staff picker appears (all 6 staff visible)
   - Click your name → Home screen loads with your role-specific tiles

### 2. **Floor Plan**
   - Tap "Floor Plan" tile or "My tiles" button → Shows floor plan
   - Should see:
     - No demo bookings (clean state unless bookings imported)
     - Green tables for tomorrow's bookings
     - Real bookings from live Square data (once synced)

### 3. **Table Workflow**
   - Click a table → Opens booking detail
   - See: Customer name, party size, current stage
   - "Next step" button → Opens stage (Booking/Engagement/Completion/Kiln)
   - Complete workflow through all stages

### 4. **Each Staff Member's Home**
   - Daisy (GM): Full admin + takings + Square pull
   - Jenny (Studio Executive): Longer workflow due to packing process  
   - Elliott (Marketing & Host By Post): Host By Post tile + standard flow
   - David (GM/Barista/Maintenance): All admin features
   - Ruby & Lucy (Assistants): Simplified tile set

### 5. **Pull Square Data**
   - Click "📥 Pull real Square history" (top bar or home)
   - Should show progress feedback
   - Bookings appear on floor plan after sync

---

## Deployment Steps

1. **On Render Dashboard**:
   - Go to `glazeup-api.onrender.com`
   - Click "Manual Deploy" (auto-deploy is paused)
   - Wait for "Build in progress" → "Build succeeded"

2. **On Your Device**:
   - Open https://glazeup-api.onrender.com/admin/dashboard-local.html
   - Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
   - Splash should appear immediately

3. **Verify**:
   - Click splash → Staff picker appears
   - Full end-to-end workflow works

---

## Open Items (For Investigation, Not Blocking)

- **Demo bookings**: If old demo data is still in database, it will show on floor plan. Clean via Supabase if needed.
- **Loading bars**: Progress feedback is ready but verify visibility on device
- **Square pull feedback**: Improved with toast notifications (commit ready if merged)

---

## Files Changed

- `admin/dashboard-local.html`: Splash/login flow fixes
- `ROLLING_NOTES.md`: Full session record

**Ready to deploy. Test on device after Render sync completes.**
