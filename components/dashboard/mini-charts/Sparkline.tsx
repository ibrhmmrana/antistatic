'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklineProps {
  data: Array<{ x: string; y: number }>
  color?: string
  height?: number
}

export function Sparkline({ data, color = '#1a73e8', height = 40 }: SparklineProps) {
  // Transform data for Recharts (expects array of objects with numeric keys)
  const chartData = data.map((d, idx) => ({
    value: d.y,
    index: idx,
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
          <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
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
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
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

