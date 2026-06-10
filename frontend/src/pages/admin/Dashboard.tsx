import { Typography, Card, Row, Col, Statistic } from 'antd'
import {
  UserOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  AuditOutlined,
} from '@ant-design/icons'

const { Title } = Typography

export default function Dashboard() {
  return (
    <div>
      <Title level={2}>数据统计</Title>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="用户总数" value={0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="文档总数" value={0} prefix={<FileOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="问答总量" value={0} prefix={<QuestionCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="待审核" value={0} prefix={<AuditOutlined />} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
