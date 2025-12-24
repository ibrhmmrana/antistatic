'use client'

import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts'

interface MiniBarsProps {
  data: Array<{ x: string; y: number }>
  color?: string
  height?: number
}

export function MiniBars({ data, color = '#34a853', height = 40 }: MiniBarsProps) {
  // Transform data for Recharts
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
          <BarChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
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
              fill={color}
              radius={[2, 2, 0, 0]}
              isAnimationActive={true}
              animationDuration={300}
            />
          </BarChart>
        </ResponsiveContainer>
      )
}

