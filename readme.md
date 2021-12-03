## 流程

### 服务

1. 获取配置：线上配置【remote】、缓存（本地上次部署的结果配置）【state】、本地配置【local】
2. 转换配置
  1. 检测没有配置的权限： **TODO**
  2. 检测如果 remote 不存在：**返回获取的配置，标记不需要交互，远端不存在**
  3. 转换日志配置
    - 检测线上不存在日志配置：删除 remote.logConfig 字段
    - 检测线上存在日志配置，并且本地日志配置是 auto：local.logConfig = remote.logConfig 
  4. 转换专有网络配置
    - 检测线上不存在专有网络配置：删除 remote.vpcConfig 字段
    - 检测线上存在专有网络配置，并且本地专有网络配置是 auto：local.vpcConfig = remote.vpcConfig;
    - 检测线上存在专有网络配置，并且本地也存在专有网络配置：兼容 vSwitchIds/vswitchIds 字段
  5. 转换存储配置
    - 检测线上不存在存储配置：删除 remote.nasConfig 字段
    - 检测线上存在存储配置，先转换成本地的配置方式；如果本地存储配置是 auto，复用转化配置后的配置
  6. 转换链路追踪
    - 检测线上存在链路追踪配置：remote.tracingConfig = 'Enable'
    - 检测线上不存在链路追踪配置：delete remote.tracingConfig 字段
  7. 服务角色处理
    - **TODO**
  8. remote 删除系统字段 'vendorConfig', 'serviceName', 'serviceId', 'createdTime', 'lastModifiedTime'
3. diff 转换后的 local 和 remote，记录 diff
4. 判断转换前的 remote 是否和 state 全等：
  - 全等说明托管给了工具则标记 deploy 不交互
  - 不全等，根据步骤三的 diff 结果判断是否交互，配置有变动则标记 deploy 交互，配置没有变动则标记 deploy 不交互
5. **返回remote、state、转化后的 local 配置、diff、needInteract**


### 函数

1. 获取配置：线上配置【remote】、缓存（本地上次部署的结果配置）【state】、本地配置【local】
2. 转换配置
  1. 检测没有配置的权限： **TODO**
  2. 检测如果 remote 不存在：**返回获取的配置，标记不需要交互，远端不存在**
  3. 检测 remote 示例类型是否是 g1，如果不是则 delete remote.gpuMemorySize 字段
  4. 检测 remote customDNS、preStop、preFreeze、initializer，不存在则 是否存在，不存在则删除相关字段
  5. remote 删除系统字段：'lastModifiedTime', 'createdTime', 'codeChecksum', 'codeSize', 'functionName', 'functionId'
  6. 如果 local 存在 environmentVariables，将 environmentVariables 的值强制转化成 string 类型
  7. 如果存在 local 存在 customDNS，深度遍历将 customDNS 的值强制转化成 string 类型
  8. 删除 local 的代码配置：codeUri、ossBucket、ossKey
3. diff 转换后的 local 和 remote，记录 diff
4. 将删除的 local 的代码配置回写
5. 判断转换前的 remote 是否和 state 全等：
  - 全等说明托管给了工具则标记 deploy 不交互
  - 不全等，根据步骤三的 diff 结果判断是否交互，配置有变动则标记 deploy 交互，配置没有变动则标记 deploy 不交互
6. **返回remote、state、转化后的 local 配置、diff、needInteract**


### 触发器
1. 获取配置：线上配置【remote】、缓存（本地上次部署的结果配置）【state】、本地配置【local】
2. 转换配置
  1. 检测没有配置的权限： **TODO**
  2. 检测如果 remote 不存在：**返回获取的配置，标记不需要交互，远端不存在**
  3. 将 remote 配置转化成 fc 组件规范的字段
  4. sourceArn 的处理【方案一】：远端的 sourceArn 做拆分处理，还原 trigger.config 配置；然后 local 根据配置组装 sourceArn；这样都会存在两份配置，就做到了配置统一
  5. sourceArn 的处理【方案二】：然后 local 根据配置组装 sourceArn，然后删除组装的字段。PS：这样是否会影响接口的调用待确认
3. diff 转换后的 local 和 remote，记录 diff
4. 判断转换前的 remote 是否和 state 全等：
  - 全等说明托管给了工具则标记 deploy 不交互
  - 不全等，根据步骤三的 diff 结果判断是否交互，配置有变动则标记 deploy 交互，配置没有变动则标记 deploy 不交互
5. **返回remote、state、转化后的 local 配置、diff、needInteract**

### 自定义域名
1. 获取配置
  1. 获取缓存（本地上次部署的结果配置）【state】
  2. 获取本地配置【local】。当本地配置的名称是 auto 时，则读取缓存里面的 domainName，如果缓存 name 不存在则默认为 domain name 是 \`\${functionName}.\${serviceName}.\${userId}.\${region}.fc.devsapp.net\`.toLocaleLowerCase()
  3. 根据 local 获取线上配置【remote】
2. 转换配置
  // TODO
3. diff 转换后的 local 和 remote，记录 diff
4. 判断转换前的 remote 是否和 state 全等：
  - 全等说明托管给了工具则标记 deploy 不交互
  - 不全等，根据步骤三的 diff 结果判断是否交互，配置有变动则标记 deploy 交互，配置没有变动则标记 deploy 不交互
5. **返回remote、state、转化后的 local 配置、diff、needInteract**

