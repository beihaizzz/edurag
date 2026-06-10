import { Typography, Card, Empty } from 'antd'
import { useSearchParams } from 'react-router-dom'

const { Title, Text } = Typography

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  return (
    <div>
      <Title level={2}>搜索结果</Title>
      <Text type="secondary">
        {query ? `关键词："${query}"` : '请输入搜索关键词'}
      </Text>
      <Card style={{ marginTop: 16 }}>
        <Empty description="暂无搜索结果，请尝试其他关键词" />
      </Card>
    </div>
  )
}
