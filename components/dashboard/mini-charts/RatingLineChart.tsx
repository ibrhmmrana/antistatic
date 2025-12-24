'use client'

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

interface RatingLineChartProps {
  data: Array<{ x: string; y: number }>
  color?: string
  height?: number
}

/**
 * Get day of week abbreviation (0 = Sunday, 6 = Saturday)
 */
function getDayOfWeekLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const dayOfWeek = date.getDay() // 0 = Sunday, 6 = Saturday
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    return labels[dayOfWeek] || ''
  } catch {
    return ''
  }
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

export function RatingLineChart({ data, color = '#fbbf24', height = 60 }: RatingLineChartProps) {
  // Show last 7 days ending today (not Sunday-Saturday)
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Reset to start of day
  
  // Map input data by date string (YYYY-MM-DD) using local time
  const dataByDate = new Map<string, number>()
  data.forEach((d) => {
    try {
      const date = new Date(d.x)
      date.setHours(0, 0, 0, 0)
      const dateStr = formatLocalDate(date)
      dataByDate.set(dateStr, d.y)
    } catch {
      // Skip invalid dates
    }
  })

  // Build chart data for last 7 days (6 days ago to today)
  const chartData: Array<{
    value: number | null
    label: string
    dateStr: string
    isToday: boolean
    date: Date
  }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = formatLocalDate(date)
    const value = dataByDate.get(dateStr) || null
    const isToday = i === 0
    
    chartData.push({
      value,
      label: getDayOfWeekLabel(dateStr),
      dateStr,
      isToday,
      date,
    })
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        No data
      </div>
    )
  }

  // Calculate domain for y-axis (rating is typically 0-5, but we'll use the data range with padding)
  const values = chartData.map((d) => d.value).filter((v) => v !== null) as number[]
  const minValue = values.length > 0 ? Math.min(...values) : 0
  const maxValue = values.length > 0 ? Math.max(...values) : 5
  const domainMin = Math.max(0, Math.floor(minValue * 2) / 2 - 0.5) // Round down to nearest 0.5, minus 0.5
  const domainMax = Math.min(5, Math.ceil(maxValue * 2) / 2 + 0.5) // Round up to nearest 0.5, plus 0.5

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={(props: any) => {
            const { x, y, payload } = props
            const isToday = chartData[payload.index]?.isToday
            return (
              <g transform={`translate(${x},${y})`}>
                <text
                  x={0}
                  y={0}
                  dy={16}
                  textAnchor="middle"
                  fill={isToday ? color : '#6b7280'}
                  fontSize={11}
                  fontWeight={isToday ? 700 : 500}
                  textDecoration={isToday ? 'underline' : 'none'}
                >
                  {payload.value}
                </text>
              </g>
            )
          }}
          interval={0}
        />
        <YAxis hide domain={[domainMin, domainMax]} />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const value = payload[0].value
              const numValue = typeof value === 'number' ? value : null
              return (
                <div className="bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg">
                  {numValue !== null ? numValue.toFixed(1) : '—'}
                </div>
              )
            }
            return null
          }}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={true}
          animationDuration={300}
          connectNulls={true}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

