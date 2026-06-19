import ReactECharts from 'echarts-for-react'
import { EChartsOption } from 'echarts'
import { TrendPoint } from '../api'

interface Props {
  data: TrendPoint[]
}

const TrendChart: React.FC<Props> = ({ data }) => {
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    legend: {
      data: ['接待工单数', '平均响应时长(秒)', '解决率(%)', 'SLA达标率(%)'],
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((d) => d.date),
    },
    yAxis: [
      {
        type: 'value',
        name: '工单/百分比',
        position: 'left',
      },
      {
        type: 'value',
        name: '秒',
        position: 'right',
      },
    ],
    series: [
      {
        name: '接待工单数',
        type: 'line',
        smooth: true,
        data: data.map((d) => d.ticket_count),
        itemStyle: { color: '#1677ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(22, 119, 255, 0.3)' },
              { offset: 1, color: 'rgba(22, 119, 255, 0.05)' },
            ],
          },
        },
      },
      {
        name: '平均响应时长(秒)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: data.map((d) => d.avg_response_time),
        itemStyle: { color: '#fa8c16' },
      },
      {
        name: '解决率(%)',
        type: 'line',
        smooth: true,
        data: data.map((d) => d.resolution_rate),
        itemStyle: { color: '#52c41a' },
      },
      {
        name: 'SLA达标率(%)',
        type: 'line',
        smooth: true,
        data: data.map((d) => d.sla_compliance_rate),
        itemStyle: { color: '#722ed1' },
      },
    ],
  }

  return <ReactECharts option={option} style={{ height: 350 }} />
}

export default TrendChart
