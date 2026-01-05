# Planner Calendar Navigation Audit

## PART 1 — Calendar Implementation Summary

### Calendar Library
- **Library**: FullCalendar v6.1.20 (`@fullcalendar/react`, `@fullcalendar/core`)
- **Plugins Used**:
  - `@fullcalendar/daygrid` (month view)
  - `@fullcalendar/timegrid` (week view)
  - `@fullcalendar/list` (list view)
  - `@fullcalendar/interaction` (drag/drop, date selection)

### Component Architecture
- **PlannerTab**: Client component (`'use client'`)
- **FullCalendarWrapper**: Client component (`'use client'`)
  - Wraps `@fullcalendar/react` FullCalendar component
  - Uses `forwardRef` to expose `getApi()` and `isReady()` methods
  - Internal ref chain: `calendarRef` (PlannerTab) → `FullCalendarWrapper` → `calendarRef` (internal) → `FullCalendar` component

### UI Controls for Navigation
1. **Month Picker Input** (line 624-637)
   - Type: `<input type="month">`
   - Value: `currentDate` state (YYYY-MM format)
   - Handler: `onChange` → calls `handleDateSelect(newDate)`
   - Disabled when: `!calendarReady`

2. **Today Button** (line 617-622)
   - Handler: `onClick={() => handleNavigate('today')}`
   - Calls: `calendarApi.today()`

3. **View Toggle Buttons** (Month/Week/List) (line 678-709)
   - Handler: `onClick={() => handleViewChange('month'|'week'|'list')}`
   - Calls: `calendarApi.changeView(viewName)`

### State Management
- **`currentDate`**: `useState<Date>` - tracks the displayed month/year
- **`viewMode`**: `useState<ViewMode>` - tracks current view ('month'|'week'|'list')
- **`calendarReady`**: `useState<boolean>` - tracks if calendar API is accessible
- **`calendarRef`**: `useRef<any>(null)` - ref to FullCalendarWrapper instance

### Navigation Flow (Intended)
1. **Month Picker Change**:
   - User changes month input → `handleDateSelect(date)` called
   - Checks `calendarReady`, gets `calendarApi` via `getCalendarApi()`
   - Calls `calendarApi.gotoDate(date)`
   - Sets `currentDate` state directly
   - FullCalendar's `datesSet` callback fires → updates `currentDate` if month changed

2. **Today/Prev/Next** (if buttons exist):
   - Calls `handleNavigate(direction)`
   - Gets `calendarApi`, calls `calendarApi.prev()/next()/today()`
   - `datesSet` callback updates `currentDate`

3. **View Change**:
   - Calls `handleViewChange(view)`
   - Gets `calendarApi`, calls `calendarApi.changeView(viewName)`
   - `datesSet` callback updates `currentDate`

### Ref Chain
```
PlannerTab.calendarRef (useRef)
  ↓ (passed to FullCalendarWrapper via ref prop)
FullCalendarWrapper (forwardRef)
  ↓ (exposes getApi() via useImperativeHandle)
  ↓ (internal calendarRef points to FullCalendar component)
FullCalendar (@fullcalendar/react)
  ↓ (has getApi() method that returns CalendarApi)
CalendarApi (FullCalendar's API object)
```

### Event Fetching
- **Method**: `fetchPosts()` (line 89-138)
- **Range**: 6 months back, 12 months forward (wide range to avoid refetching)
- **API**: `/api/social-studio/posts?businessLocationId=...&from=...&to=...`
- **Mapping**: Posts transformed to FullCalendar `EventInput[]` format
- **State**: Stored in `events` state, passed to FullCalendar via `events` prop

### FullCalendar CSS
- **Status**: ⚠️ **ADDED** - FullCalendar CSS imports added to `app/globals.css`
- **Import Paths** (v6.1.20):
  ```css
  @import '@fullcalendar/core/main.css';
  @import '@fullcalendar/daygrid/main.css';
  @import '@fullcalendar/timegrid/main.css';
  @import '@fullcalendar/list/main.css';
  ```
- **Note**: FullCalendar requires CSS for proper rendering and functionality
- **Header Toolbar**: `headerToolbar={false}` - FullCalendar's built-in navigation is disabled, using custom controls instead

## PART 2 — Potential Issues Identified

### Issue 1: Missing FullCalendar CSS
- FullCalendar requires CSS to render properly
- Without CSS, navigation controls may not render or function correctly

### Issue 2: Ref Chain Complexity
- Double indirection: `calendarRef.current.getApi()` → `calendarRef.current.getApi()` (wrapper's internal ref)
- If wrapper's internal ref is null, `getApi()` returns null

### Issue 3: State Update Timing
- `handleDateSelect` sets `currentDate` state directly
- `datesSet` callback also updates `currentDate` if month changed
- Potential race condition or loop if both fire

### Issue 4: Calendar Ready Check
- `calendarReady` state is set in `datesSet` callback and `loading` callback
- If calendar never fires `datesSet`, `calendarReady` stays false
- Month picker remains disabled

## PART 3 — Instrumentation Added

### Console Logs Added
1. **Mount/Remount**: Logs `calendarRef.current` on component mount
2. **getCalendarApi()**: Logs ref state and returned API
3. **Month Picker onChange**: Logs value and computed date
4. **handleDateSelect()**: Logs date, calendarReady, API existence, and gotoDate() calls
5. **handleNavigate()**: Logs direction and API method calls
6. **datesSet callback**: Logs view type, currentStart, and state update decisions

### Debug UI Badge Added
- Shows: `YYYY-MM | API: ✓/✗ | Ready: ✓/✗`
- Location: Top-left controls area (temporary)
- Purpose: Visual indicator of calendar state

## PART 4 — Root Cause Hypothesis

Based on code analysis, potential issues:

### Hypothesis 1: Missing FullCalendar CSS (FIXED)
- **Status**: ✅ Fixed - CSS imports added
- **Impact**: Calendar may not render navigation controls properly without CSS

### Hypothesis 2: Ref Chain Not Ready
- **Symptom**: `calendarRef.current` is null or `getApi()` returns null
- **Evidence Needed**: Check console logs for "calendarRef.current is null" or "getApi is not a function"
- **Fix**: Ensure FullCalendarWrapper properly forwards ref and exposes getApi()

### Hypothesis 3: Calendar Never Fires datesSet
- **Symptom**: `calendarReady` stays false, month picker disabled
- **Evidence Needed**: Check if "datesSet callback fired" appears in logs
- **Fix**: Ensure FullCalendar is properly mounted and initialized

### Hypothesis 4: gotoDate() Called But View Doesn't Update
- **Symptom**: `gotoDate()` called but calendar view doesn't change
- **Evidence Needed**: Check if "calling calendarApi.gotoDate()" appears but datesSet doesn't fire with new date
- **Fix**: May need to use `key` prop to force remount, or check for conflicting state updates

## PART 5 — Testing Instructions

1. **Open browser console** and navigate to Planner tab
2. **Observe initial logs**:
   - Does "Mount/Remount" log show calendarRef.current?
   - Does "Plugins loaded" appear?
   - Does "datesSet callback fired" appear?
3. **Try month picker**:
   - Change month in picker
   - Check console for "Month picker onChange fired"
   - Check console for "handleDateSelect() called"
   - Check console for "calling calendarApi.gotoDate()"
   - Check console for "datesSet callback fired" with new date
4. **Check debug badge**:
   - Does it show API: ✓ or ✗?
   - Does it show Ready: ✓ or ✗?
5. **Report findings**:
   - Which logs appear?
   - Which logs are missing?
   - What does debug badge show?
   - Does calendar view actually change?

