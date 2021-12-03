
import _ from 'lodash';
import PlanFunction from './plan-function';
import PlanService from './plan-service';
import PlanTrigger from './plan-trigger';
import PlanDomain from './plan-domain';

export default class PlanDeploy {
  async plan(localConfig, fcClient, subCommand) {
    const plan: any = {
      region: localConfig.region,
    };
  
    if (_.isEmpty(subCommand) || subCommand === 'service') {
      const getServicePlan = new PlanService(localConfig, fcClient);
      plan.service = await getServicePlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'function') {
      const getFunctionPlan = new PlanFunction(localConfig, fcClient);
      plan.function = await getFunctionPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'trigger') {
      const getTriggerPlan = new PlanTrigger(localConfig, fcClient);
      plan.trigger = await getTriggerPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'domain') {
      const getDomainPlan = new PlanDomain(localConfig, fcClient);
      plan.domain = await getDomainPlan.getPlan();
    }

    return plan;
  }
}

/**
 * 
 * 5 yaml
 * 
 * remote: 10 => 5 -> 提示
 * local: 6 => 3 -> 3 说明支持不支持
 */
