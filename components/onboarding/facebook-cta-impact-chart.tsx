'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

interface CTAImpactDataPoint {
  name: string
  value: number
  fill: string
}

interface CTAImpactChartProps {
  data: CTAImpactDataPoint[]
}

export default function CTAImpactChart({ data }: CTAImpactChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <XAxis 
          dataKey="name" 
          style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '12px' }} 
        />
        <YAxis 
          style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '12px' }} 
          label={{ value: 'Avg Actions', angle: -90, position: 'insideLeft', style: { fontFamily: 'var(--font-roboto-stack)', fontSize: '11px' } }}
        />
        <Tooltip 
          formatter={(value: number) => value.toLocaleString()}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

