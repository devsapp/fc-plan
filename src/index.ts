import * as core from '@serverless-devs/core';
import logger from './common/logger';
import Client from './lib/client';
import PlanDeploy from './lib/deploy';
import PlanRemove from './lib/remove';

const _ = core.lodash;

export default class ComponentDemo {
  /**
   * demo 实例
   * @param inputs
   * @returns
   */
  async plan(inputs) {
    const {
      appName,
      credentials,
      props = {},
      project = {},
    } = inputs;
    const { access } = project;

    // TODO:
    // 1. config 和 code diff 理论上是需要分开的
    // 2. plan 和 deploy，diff 理论上也是需要分开的
    const parsedArgs = core.commandParse(inputs, {
      string: ['sub-command', 'plan-type'],
    });
    const {
      'plan-type': planType = 'deploy',
      'sub-command': subCommand,
    } = parsedArgs?.data || {};
    const region = parsedArgs?.data?.region || props?.region;

    if (_.isEmpty(region)) {
      throw new Error('The region field was not found');
    }

    logger.debug(`region: ${region}`);
    logger.debug(`access: ${access}`);
    logger.debug(`planType: ${planType}`);
    logger.debug(`subCommand: ${subCommand}`);

    const client = new Client(region, credentials, access, _.cloneDeep({
      project: inputs?.project,
      credentials,
      appName,
    }));
    const fcClient = await client.getFcClient();

    if (_.isEqual(planType, 'deploy')) {
      const cred = _.isEmpty(credentials) ? await core.getCredential(access) : credentials;
      const planDeploy = new PlanDeploy(cred);
      return await planDeploy.plan(props, fcClient, subCommand);
    } else if (_.isEqual(planType, 'remove')) {
      const planRemove = new PlanRemove();
      return await planRemove.plan(props, fcClient, subCommand || 'service', parsedArgs?.data || {});
    } else {
      throw new Error(`The incoming ${planType} command is not supported`);
    }
  }
}
