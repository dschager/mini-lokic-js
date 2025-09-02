import process from "process";

// MySQL
export const PL_PROD_DB_HOST = 'pipeline-core-replica2.rds.locallabs.com'; // (readonly!)
export const PL_STAGE_DB_HOST = 'pl-staging.rds.locallabs.com';
export const VOTERS03_DB = "voters03.rds.locallabs.com";
export const DB01 = 'db01.blockshopper.com';
export const DB02 = 'db02.blockshopper.com';
export const DB03 = 'db03.blockshopper.com';
export const DB04 = 'db04.blockshopper.com';
export const DB05 = '10.0.1.101';
export const DB06 = 'db06.blockshopper.com';
export const DB07 = 'db07.blockshopper.com';
export const DB08 = 'db08.rds.blockshopper.com';
export const DB10 = 'db10.blockshopper.com';
export const DB13 = 'db13.blockshopper.com'
export const DB14 = 'db14.blockshopper.com'
export const DB15 = 'db15.blockshopper.com'

// PG
export const ACE_HOST = 'ace.rds.locallabs.com';
export const DB_LIMPAR_LL = 'limpar-prod-replica01.cmqvvgnevr3t.us-east-1.rds.amazonaws.com';
export const DB_ROSELAND = 'roseland-dev.rds.locallabs.com';
export const PIPELINE_GIS_HOST = 'pl-gis.rds.locallabs.com';
export const PL_GIS_STAGING_HOST = 'pl-shapes-staging.rds.locallabs.com '; // (readonly!)
export const PL_GIS_PROD_HOST = 'pl-shapes.rds.locallabs.com'; // (readonly!)
export const LUMEN_DB = 'analytics.rds.locallabs.com';

// Pathes
export const CONFIG_DIR = `${process.cwd()}/src/config`;
