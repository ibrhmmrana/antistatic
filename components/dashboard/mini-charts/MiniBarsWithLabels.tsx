'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

interface MiniBarsWithLabelsProps {
  data: Array<{ x: string; y: number }>
  color?: string
  height?: number
  timePeriod?: number // Number of days (7, 30, or 90)
}

/**
 * Get day of week abbreviation (0 = Sunday, 6 = Saturday)
 */
function getDayOfWeekLabel(date: Date): string {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return labels[date.getDay()] || ''
}

/**
 * Format date as YYYY-MM-DD using local time (not UTC)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get week label (e.g., "W1", "W2") for a date
 */
function getWeekLabel(date: Date, startDate: Date): string {
  const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const weekNum = Math.floor(daysDiff / 7) + 1
  return `W${weekNum}`
}

/**
 * Get 15-day period label (e.g., "P1", "P2") for a date
 */
function getPeriodLabel(date: Date, startDate: Date): string {
  const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const periodNum = Math.floor(daysDiff / 15) + 1
  return `P${periodNum}`
}

export function MiniBarsWithLabels({ data, color = '#fbbf24', height = 60, timePeriod = 7 }: MiniBarsWithLabelsProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        No data
      </div>
    )
  }

  // Parse and sort data by date
  const parsedData = data
    .map((d) => {
      try {
        const date = new Date(d.x)
        date.setHours(0, 0, 0, 0)
        return {
          date,
          dateStr: formatLocalDate(date),
          value: d.y || 0,
        }
      } catch {
        return null
      }
    })
    .filter((d): d is { date: Date; dateStr: string; value: number } => d !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (parsedData.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        No data
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = parsedData[0].date
  const endDate = parsedData[parsedData.length - 1].date
  const isToday = (date: Date) => formatLocalDate(date) === formatLocalDate(today)

  let chartData: Array<{
    value: number
    label: string
    dateStr: string
    isToday: boolean
    date: Date
  }> = []

  if (timePeriod === 7) {
    // 7 days: show individual days with day-of-week labels
    parsedData.forEach((d) => {
      chartData.push({
        value: d.value,
        label: getDayOfWeekLabel(d.date),
        dateStr: d.dateStr,
        isToday: isToday(d.date),
        date: d.date,
      })
    })
  } else if (timePeriod === 30) {
    // 30 days: aggregate by week (4-5 weeks)
    const weeksData = new Map<number, { value: number; firstDate: Date; weekNum: number }>()
    
    parsedData.forEach((d) => {
      const daysFromStart = Math.floor((d.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const weekNum = Math.floor(daysFromStart / 7)
      
      if (!weeksData.has(weekNum)) {
        weeksData.set(weekNum, {
          value: 0,
          firstDate: d.date,
          weekNum,
        })
      }
      
      const weekData = weeksData.get(weekNum)!
      weekData.value += d.value
    })
    
    // Build chart data for weeks (sorted by week number)
    const sortedWeeks = Array.from(weeksData.entries()).sort((a, b) => a[0] - b[0])
    sortedWeeks.forEach(([weekNum, weekData]) => {
      const isCurrentWeek = isToday(weekData.firstDate) || weekNum === sortedWeeks.length - 1
      chartData.push({
        value: weekData.value,
        label: `W${weekNum + 1}`,
        dateStr: formatLocalDate(weekData.firstDate),
        isToday: isCurrentWeek,
        date: weekData.firstDate,
      })
    })
  } else if (timePeriod === 90) {
    // 90 days: aggregate by 15-day periods (6 periods)
    // Initialize all 6 periods upfront to ensure they all show
    const periodsData = new Map<number, { value: number; firstDate: Date; periodNum: number }>()
    
    // Calculate the expected start date (90 days ago from the last data point or today)
    const expectedStartDate = parsedData.length > 0 
      ? new Date(parsedData[0].date)
      : (() => {
          const d = new Date(today)
          d.setDate(d.getDate() - 90)
          return d
        })()
    expectedStartDate.setHours(0, 0, 0, 0)
    
    // Initialize all 6 periods (0-5)
    for (let periodNum = 0; periodNum < 6; periodNum++) {
      const periodStartDate = new Date(expectedStartDate)
      periodStartDate.setDate(periodStartDate.getDate() + (periodNum * 15))
      periodsData.set(periodNum, {
        value: 0,
        firstDate: periodStartDate,
        periodNum,
      })
    }
    
    // Aggregate data into periods
    parsedData.forEach((d) => {
      const daysFromStart = Math.floor((d.date.getTime() - expectedStartDate.getTime()) / (1000 * 60 * 60 * 24))
      const periodNum = Math.min(Math.max(0, Math.floor(daysFromStart / 15)), 5) // Clamp to 0-5
      
      if (periodsData.has(periodNum)) {
        const periodData = periodsData.get(periodNum)!
        periodData.value += d.value
      }
    })
    
    // Build chart data for all periods (sorted by period number)
    const sortedPeriods = Array.from(periodsData.entries()).sort((a, b) => a[0] - b[0])
    sortedPeriods.forEach(([periodNum, periodData]) => {
      const isCurrentPeriod = periodNum === sortedPeriods.length - 1
      chartData.push({
        value: periodData.value,
        label: `P${periodNum + 1}`,
        dateStr: formatLocalDate(periodData.firstDate),
        isToday: isCurrentPeriod,
        date: periodData.firstDate,
      })
    })
  } else {
    // Fallback: show individual days (for any other time period)
    parsedData.forEach((d) => {
      chartData.push({
        value: d.value,
        label: getDayOfWeekLabel(d.date),
        dateStr: d.dateStr,
        isToday: isToday(d.date),
        date: d.date,
      })
    })
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        No data
      </div>
    )
  }

  // Calculate max value and set domain with some padding
  const maxValue = Math.max(...chartData.map((d) => d.value), 1)
  const domainMax = maxValue === 0 ? 1 : Math.ceil(maxValue * 1.2) // Add 20% padding

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={(props: any) => {
            const { x, y, payload } = props
            const dataPoint = chartData[payload.index]
            const isToday = dataPoint?.isToday
            const label = payload.value
            
            // Determine tooltip text based on time period and label
            let tooltipText = ''
            if (timePeriod === 30 && label.startsWith('W')) {
              tooltipText = 'Week'
            } else if (timePeriod === 90 && label.startsWith('P')) {
              tooltipText = '15 day interval'
            } else {
              tooltipText = 'Day'
            }
            
            return (
              <g transform={`translate(${x},${y})`}>
                <title>{tooltipText}</title>
                <text
                  x={0}
                  y={0}
                  dy={16}
                  textAnchor="middle"
                  fill={isToday ? color : '#6b7280'}
                  fontSize={11}
                  fontWeight={isToday ? 700 : 500}
                  textDecoration={isToday ? 'underline' : 'none'}
                  style={{ cursor: 'help' }}
                >
                  {payload.value}
                </text>
              </g>
            )
          }}
          interval={0}
        />
        <YAxis
          hide={true}
          domain={[0, domainMax]}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg">
                  {payload[0].value}
                </div>
              )
            }
            return null
          }}
          cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          isAnimationActive={true}
          animationDuration={300}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isToday ? color : color}
              opacity={entry.isToday ? 1 : 0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

