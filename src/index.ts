import * as core from '@serverless-devs/core';
import _ from 'lodash';
import logger from './common/logger';
import Client from './lib/client';
import PlanDeploy from './lib/deploy';
import PlanRemove from './lib/remove';

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
      const planDeploy = new PlanDeploy();
      return await planDeploy.plan(props, fcClient, subCommand);
    } else if (_.isEqual(planType, 'remove')) {
      const planRemove = new PlanRemove();
      return await planRemove.plan(props, fcClient, subCommand || 'service', parsedArgs?.data || {});
    } else {
      throw new Error(`The incoming ${planType} command is not supported`);
    }
  }
}
