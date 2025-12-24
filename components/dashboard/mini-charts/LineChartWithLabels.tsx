'use client'

import { LineChart, Line, XAxis, ResponsiveContainer } from 'recharts'

interface LineChartWithLabelsProps {
  data: Array<{ x: string; y: number }>
  color?: string
  height?: number
}

/**
 * Format date to show month abbreviation and day with ordinal
 * Example: "2025-12-17" -> "Dec 17th"
 */
function formatDateLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    
    // Add ordinal suffix
    const getOrdinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }
    
    return `${month} ${getOrdinal(day)}`
  } catch {
    return dateStr
  }
}

export function LineChartWithLabels({ data, color = '#34a853', height = 40 }: LineChartWithLabelsProps) {
  // Transform data for Recharts with formatted labels
  const chartData = data.map((d) => ({
    value: d.y,
    label: formatDateLabel(d.x),
    date: d.x,
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 25, left: 5 }}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 9, fill: '#6b7280' }}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={30}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

