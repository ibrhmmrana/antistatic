'use client'

import FullCalendar from '@fullcalendar/react'
import type { CalendarOptions, CalendarApi } from '@fullcalendar/core'
import { forwardRef, useImperativeHandle, useRef } from 'react'

/**
 * FullCalendarWrapper - Wrapper component to expose CalendarApi via ref
 * 
 * FullCalendar's ref points to the Calendar component instance, which has a `getApi()` method
 * that returns the CalendarApi. This wrapper exposes that API cleanly.
 */
const FullCalendarWrapper = forwardRef<any, CalendarOptions>((props, ref) => {
  // Internal ref to the FullCalendar component instance
  // FullCalendar's ref.current is the Calendar component, which has getApi() method
  const calendarRef = useRef<any>(null)

  // Expose CalendarApi accessor methods via useImperativeHandle
  useImperativeHandle(ref, () => ({
    /**
     * Returns the FullCalendar CalendarApi instance, or null if not ready
     * The CalendarApi provides methods like gotoDate(), changeView(), prev(), next(), today()
     */
    getApi: (): CalendarApi | null => {
      // calendarRef.current is the FullCalendar Calendar component instance
      // It has a getApi() method that returns the CalendarApi
      if (calendarRef.current && typeof calendarRef.current.getApi === 'function') {
        return calendarRef.current.getApi()
      }
      return null
    },
    /**
     * Returns true if the calendar API is ready to use
     */
    isReady: (): boolean => {
      return calendarRef.current !== null && typeof calendarRef.current?.getApi === 'function'
    },
  }), [])

  return <FullCalendar ref={calendarRef} {...props} />
})

FullCalendarWrapper.displayName = 'FullCalendarWrapper'

export default FullCalendarWrapper
