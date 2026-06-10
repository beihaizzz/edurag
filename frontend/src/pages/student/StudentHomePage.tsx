import { Typography, Card } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

export default function StudentHomePage() {
  return (
    <div>
      <Title level={2}>课程资料检索与智能问答</Title>
      <Card style={{ marginTop: 16 }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <SearchOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
          <Title level={4}>输入关键词或问题，开始检索</Title>
          <Paragraph type="secondary">
            支持关键词精确检索与自然语言语义检索
          </Paragraph>
        </div>
      </Card>
    </div>
  )
}
