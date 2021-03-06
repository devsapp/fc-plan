
import { lodash as _ } from '@serverless-devs/core';
import PlanService from './plan-service';
import PlanFunction from './plan-function';
import PlanTrigger from './plan-trigger';
import PlanDomain from './plan-domain';

export default class PlanDeploy {
  credentials: any;

  constructor(credentials) {
    this.credentials = credentials;
  }
  async plan(localConfig, fcClient, subCommand) {
    const plan: any = {
      region: localConfig.region,
    };

    if (_.isEmpty(subCommand) || subCommand === 'service') {
      const getServicePlan = new PlanService(localConfig, fcClient, this.credentials);
      plan.service = await getServicePlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'function') {
      const getFunctionPlan = new PlanFunction(localConfig, fcClient, this.credentials);
      plan.function = await getFunctionPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'trigger') {
      const getTriggerPlan = new PlanTrigger(localConfig, fcClient, this.credentials);
      plan.triggers = await getTriggerPlan.getPlan();
    }

    if (_.isEmpty(subCommand) || subCommand === 'domain') {
      const getDomainPlan = new PlanDomain(localConfig, fcClient, this.credentials);
      plan.customDomains = await getDomainPlan.getPlan();
    }

    return plan;
  }
}
